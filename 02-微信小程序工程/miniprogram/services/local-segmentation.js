let cachedSession = null;
let cachedSessionPath = "";
let sessionPromise = null;

function createError(message, code, detail) {
  const error = new Error(message);
  error.code = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

function runtimePlatform() {
  try {
    if (typeof wx.getDeviceInfo === "function") {
      return String(wx.getDeviceInfo().platform || "").toLowerCase();
    }
    if (typeof wx.getSystemInfoSync === "function") {
      return String(wx.getSystemInfoSync().platform || "").toLowerCase();
    }
  } catch (error) {
    // Environment detection is diagnostic only.
  }
  return "";
}

function inferenceUnavailableError(nativeError) {
  const devtools = runtimePlatform() === "devtools";
  return createError(
    devtools
      ? "微信开发者工具不支持端侧 AI 推理，请使用真机预览或真机调试"
      : ((nativeError && nativeError.errMsg) || "当前设备无法初始化端侧 AI 推理"),
    devtools ? "LOCAL_INFERENCE_REAL_DEVICE_REQUIRED" : "LOCAL_INFERENCE_UNAVAILABLE",
    nativeError
  );
}

function notify(settings, stage, progress) {
  if (typeof settings.onStatus === "function") {
    settings.onStatus({ stage, progress: Number(progress) || 0 });
  }
}

function fileStat(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().stat({
      path: filePath,
      success: (result) => resolve(result.stats),
      fail: (error) => reject(createError(
        error.errMsg || "本地模型下载失败",
        "MODEL_DOWNLOAD_FAILED",
        error
      ))
    });
  });
}

function removeFile(filePath) {
  return new Promise((resolve) => {
    wx.getFileSystemManager().unlink({
      filePath,
      success: resolve,
      fail: resolve
    });
  });
}

function saveDownloadedFile(tempFilePath, filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      filePath,
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

function downloadModel(settings, filePath) {
  return new Promise((resolve, reject) => {
    const task = wx.downloadFile({
      url: settings.url,
      header: settings.headers || {},
      success: async (result) => {
        try {
          if (result.statusCode < 200 || result.statusCode >= 300) {
            throw createError(`本地模型下载失败：HTTP ${result.statusCode}`, "MODEL_DOWNLOAD_HTTP");
          }
          await removeFile(filePath);
          await saveDownloadedFile(result.tempFilePath, filePath);
          resolve(filePath);
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => reject(createError(
        error.errMsg || "本地模型下载失败",
        "MODEL_DOWNLOAD_FAILED",
        error
      ))
    });
    if (task && typeof task.onProgressUpdate === "function") {
      task.onProgressUpdate((result) => notify(settings, "model-download", result.progress));
    }
  });
}

async function ensureModel(settings) {
  if (settings.packagePath) return settings.packagePath;
  if (!settings.url) {
    throw createError("未配置本地抠图模型地址", "MODEL_URL_EMPTY");
  }
  const fileName = String(settings.fileName || "golf-modnet-fp32-v2.onnx")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
  try {
    const stats = await fileStat(filePath);
    if (!settings.expectedBytes || stats.size === settings.expectedBytes) return filePath;
    await removeFile(filePath);
  } catch (error) {
    // A cache miss is expected on first use.
  }
  notify(settings, "model-download", 0);
  const savedPath = await downloadModel(settings, filePath);
  const stats = await fileStat(savedPath);
  if (settings.expectedBytes && stats.size !== settings.expectedBytes) {
    await removeFile(savedPath);
    throw createError("本地模型文件不完整，请重试", "MODEL_SIZE_MISMATCH");
  }
  return savedPath;
}

function createSession(modelPath, settings) {
  if (typeof wx.createInferenceSession !== "function") {
    return Promise.reject(runtimePlatform() === "devtools"
      ? inferenceUnavailableError()
      : createError("当前微信版本不支持端侧 AI 推理", "LOCAL_INFERENCE_UNSUPPORTED"));
  }
  if (cachedSession && cachedSessionPath === modelPath) return Promise.resolve(cachedSession);
  if (sessionPromise && cachedSessionPath === modelPath) return sessionPromise;

  const alternatePackagePath = settings.packagePath && !settings.packagePathRetried
    ? (modelPath.startsWith("/") ? modelPath.slice(1) : `/${modelPath}`)
    : "";
  cachedSessionPath = modelPath;
  notify(settings, settings.source === "mediapipe" ? "model-fallback" : "model-load", 0);
  sessionPromise = new Promise((resolve, reject) => {
    let settled = false;
    let session;
    const precisionLevel = Number.isFinite(Number(settings.precisionLevel))
      ? Number(settings.precisionLevel)
      : 1;
    try {
      session = wx.createInferenceSession({
        model: modelPath,
        // WeChat 3.3.x used the misspelled key; newer type definitions use the corrected key.
        precesionLevel: precisionLevel,
        precisionLevel,
        typicalShape: {
          [settings.inputName || "input"]: [
            1,
            3,
            Math.max(256, Math.min(768, Number(settings.inputSize) || 512)),
            Math.max(256, Math.min(768, Number(settings.inputSize) || 512))
          ]
        },
        allowQuantize: false,
        allowNPU: settings.allowNPU !== false
      });
    } catch (error) {
      sessionPromise = null;
      if (alternatePackagePath) {
        createSession(alternatePackagePath, Object.assign({}, settings, {
          packagePathRetried: true
        })).then(resolve, reject);
        return;
      }
      reject(createError(error.errMsg || error.message || "本地模型加载失败", "MODEL_LOAD_FAILED", error));
      return;
    }
    session.onLoad(() => {
      settled = true;
      cachedSession = session;
      resolve(session);
    });
    session.onError((error) => {
      cachedSession = null;
      sessionPromise = null;
      if (!settled) {
        if (alternatePackagePath) {
          createSession(alternatePackagePath, Object.assign({}, settings, {
            packagePathRetried: true
          })).then(resolve, reject);
          return;
        }
        reject(createError(error.errMsg || "本地模型加载失败", "MODEL_LOAD_FAILED", error));
      }
    });
  });
  return sessionPromise;
}

function checkInferenceSupport() {
  if (typeof wx.createInferenceSession !== "function") {
    return Promise.reject(runtimePlatform() === "devtools"
      ? inferenceUnavailableError()
      : createError("当前微信版本不支持端侧 AI 推理", "LOCAL_INFERENCE_UNSUPPORTED"));
  }
  if (typeof wx.getInferenceEnvInfo !== "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    wx.getInferenceEnvInfo({
      success: resolve,
      fail: (error) => reject(inferenceUnavailableError(error))
    });
  });
}

function loadCanvasImage(canvas, filePath) {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = filePath;
  });
}

function buildInputTensor(canvas, image, size, settings) {
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  const plane = size * size;
  const values = new Float32Array(plane * 3);
  const zeroOne = settings.normalization === "zero-one";
  for (let index = 0; index < plane; index += 1) {
    const source = index * 4;
    values[index] = zeroOne ? pixels[source] / 255 : pixels[source] / 127.5 - 1;
    values[plane + index] = zeroOne ? pixels[source + 1] / 255 : pixels[source + 1] / 127.5 - 1;
    values[plane * 2 + index] = zeroOne ? pixels[source + 2] / 255 : pixels[source + 2] / 127.5 - 1;
  }
  const tensors = {};
  tensors[settings.inputName || "input"] = {
    type: "float32",
    shape: [1, 3, size, size],
    data: values.buffer
  };
  return tensors;
}

function tensorValues(tensor) {
  if (!tensor || !tensor.data) throw createError("本地模型没有返回蒙版", "MODEL_OUTPUT_EMPTY");
  if (tensor.data instanceof ArrayBuffer) return new Float32Array(tensor.data);
  if (ArrayBuffer.isView(tensor.data)) {
    return new Float32Array(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength / 4);
  }
  throw createError("本地模型蒙版格式不受支持", "MODEL_OUTPUT_INVALID");
}

function refineMask(values, width, height) {
  const length = width * height;
  if (values.length < length) throw createError("本地模型蒙版尺寸不正确", "MODEL_OUTPUT_SHAPE");
  const mask = new Float32Array(length);
  let foreground = 0;
  for (let index = 0; index < length; index += 1) {
    let value = Math.max(0, Math.min(1, values[index]));
    value = value * value * (3 - 2 * value);
    if (value < 0.012) value = 0;
    if (value > 0.992) value = 1;
    mask[index] = value;
    if (value >= 0.5) foreground += 1;
  }
  const foregroundRatio = foreground / length;
  return { mask, foregroundRatio };
}

function applyMaskToCanvas(canvas, image, mask, maskWidth, maskHeight, maxEdge) {
  const sourceWidth = image.width || image.naturalWidth || 1;
  const sourceHeight = image.height || image.naturalHeight || 1;
  const outputScale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * outputScale));
  const height = Math.max(1, Math.round(sourceHeight * outputScale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const denominatorX = Math.max(1, width - 1);
  const denominatorY = Math.max(1, height - 1);
  const sourceX0 = new Uint16Array(width);
  const sourceX1 = new Uint16Array(width);
  const sourceDx = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const position = x * (maskWidth - 1) / denominatorX;
    const first = Math.floor(position);
    sourceX0[x] = first;
    sourceX1[x] = Math.min(maskWidth - 1, first + 1);
    sourceDx[x] = position - first;
  }
  for (let y = 0; y < height; y += 1) {
    const sourceY = y * (maskHeight - 1) / denominatorY;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(maskHeight - 1, y0 + 1);
    const dy = sourceY - y0;
    const row0 = y0 * maskWidth;
    const row1 = y1 * maskWidth;
    for (let x = 0; x < width; x += 1) {
      const x0 = sourceX0[x];
      const x1 = sourceX1[x];
      const dx = sourceDx[x];
      const top = mask[row0 + x0] * (1 - dx) + mask[row0 + x1] * dx;
      const bottom = mask[row1 + x0] * (1 - dx) + mask[row1 + x1] * dx;
      const alpha = top * (1 - dy) + bottom * dy;
      const offset = (y * width + x) * 4 + 3;
      pixels[offset] = Math.round(pixels[offset] * alpha);
    }
  }
  context.putImageData(imageData, 0, 0);
  return { width, height };
}

function exportCanvas(canvas, dimensions) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: dimensions.width,
      height: dimensions.height,
      destWidth: dimensions.width,
      destHeight: dimensions.height,
      fileType: "png",
      quality: 1,
      success: (result) => resolve(result.tempFilePath),
      fail: reject
    });
  });
}

async function runConfiguredModel(settings, image) {
  const modelPath = await ensureModel(settings);
  const session = await createSession(modelPath, settings);
  const inputSize = Math.max(256, Math.min(768, Number(settings.inputSize) || 512));
  const outputMaxEdge = Math.max(800, Math.min(2048, Number(settings.outputMaxEdge) || 1600));

  notify(settings, "inference", 0);
  let outputs;
  try {
    outputs = await session.run(buildInputTensor(settings.canvas, image, inputSize, settings));
  } catch (error) {
    throw createError(
      error.errMsg || error.message || "本地模型运行失败",
      "MODEL_RUN_FAILED",
      error
    );
  }
  const output = outputs[settings.outputName || "output"] || outputs[Object.keys(outputs)[0]];
  const shape = output && output.shape ? output.shape : [1, 1, inputSize, inputSize];
  const maskWidth = Number(shape[3]) || inputSize;
  const maskHeight = Number(shape[2]) || inputSize;
  const refined = refineMask(tensorValues(output), maskWidth, maskHeight);
  if (refined.foregroundRatio < 0.003 || refined.foregroundRatio > 0.985) {
    return { status: "fallback", reason: "no-person", source: settings.source || "local" };
  }

  notify(settings, "refining", 0);
  const dimensions = applyMaskToCanvas(
    settings.canvas,
    image,
    refined.mask,
    maskWidth,
    maskHeight,
    outputMaxEdge
  );
  const filePath = await exportCanvas(settings.canvas, dimensions);
  return {
    status: "person",
    source: settings.source || "local",
    filePath,
    foregroundRatio: refined.foregroundRatio
  };
}

function canTryFallback(error, fallbackModel) {
  if (!fallbackModel || !fallbackModel.packagePath) return false;
  return ![
    "LOCAL_INFERENCE_REAL_DEVICE_REQUIRED",
    "LOCAL_INFERENCE_UNAVAILABLE",
    "LOCAL_INFERENCE_UNSUPPORTED",
    "LOCAL_CANVAS_MISSING"
  ].includes(error && error.code);
}

async function requestLocalSubjectCutout(options) {
  const settings = Object.assign({
    inputSize: 512,
    outputMaxEdge: 1600,
    precisionLevel: 1,
    allowNPU: false,
    normalization: "minus-one-one",
    inputName: "input",
    outputName: "output",
    source: "local"
  }, options || {});
  if (!settings.canvas) throw createError("本地抠图工作画布未初始化", "LOCAL_CANVAS_MISSING");

  await checkInferenceSupport();
  const image = await loadCanvasImage(settings.canvas, settings.filePath);
  try {
    return await runConfiguredModel(settings, image);
  } catch (primaryError) {
    if (!canTryFallback(primaryError, settings.fallbackModel)) throw primaryError;
    notify(settings, "model-fallback", 0);
    const fallbackSettings = Object.assign({}, settings, settings.fallbackModel, {
      fallbackModel: null,
      onStatus: settings.onStatus
    });
    try {
      return await runConfiguredModel(fallbackSettings, image);
    } catch (fallbackError) {
      throw createError(
        fallbackError.message || "兼容抠图模型运行失败",
        fallbackError.code || "MODEL_FALLBACK_FAILED",
        `primary=${primaryError.code || "unknown"}: ${primaryError.message}; fallback=${fallbackError.code || "unknown"}: ${fallbackError.message}`
      );
    }
  }
}

module.exports = {
  requestLocalSubjectCutout
};
