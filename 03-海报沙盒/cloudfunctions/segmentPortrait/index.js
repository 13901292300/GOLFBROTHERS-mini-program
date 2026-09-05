const cloud = require("wx-server-sdk");
const tencentcloud = require("tencentcloud-sdk-nodejs-bda");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const BdaClient = tencentcloud.bda.v20200324.Client;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}

function stripBase64(raw) {
  return String(raw || "").replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
}

function describeApiError(err) {
  if (!err) return {};
  return {
    message: err.message || err.msg || "",
    code: err.code || err.Code || "",
    requestId: err.requestId || err.RequestId || "",
    statusCode: err.statusCode || ""
  };
}

exports.main = async (event) => {
  const fileID = event && event.fileID;
  if (!fileID) {
    return { code: "IMAGE_EMPTY", message: "fileID 为空" };
  }

  try {
    console.log("[segmentPortrait] 开始下载文件:", fileID);
    const fileRes = await cloud.downloadFile({ fileID: fileID });
    const buffer = toBuffer(fileRes && fileRes.fileContent);
    if (!buffer || !buffer.length) {
      return { code: "IMAGE_EMPTY", message: "云存储下载结果为空" };
    }

    const imageBase64 = buffer.toString("base64");
    console.log("[segmentPortrait] 图片大小:", buffer.length, "bytes");
    console.log("[segmentPortrait] Base64 前100字符:", imageBase64.substring(0, 100));
    console.log("[segmentPortrait] 文件头 hex:", buffer.slice(0, 8).toString("hex"));

    if (buffer.length > MAX_IMAGE_BYTES) {
      return { code: "IMAGE_TOO_LARGE", message: "图片超过 5MB 限制" };
    }

    const secretId = process.env.SECRET_ID;
    const secretKey = process.env.SECRET_KEY;
    console.log("[segmentPortrait] 密钥状态:", {
      secretId: secretId ? "已配置" : "未配置",
      secretKey: secretKey ? "已配置" : "未配置"
    });

    if (!secretId || !secretKey) {
      return { code: "CONFIG_ERROR", message: "密钥未配置" };
    }

    const client = new BdaClient({
      credential: {
        secretId: secretId,
        secretKey: secretKey
      },
      region: "ap-guangzhou"
    });

    // SegmentPortraitPic：RspImgType 只接受 base64 或 url
    const params = {
      Image: imageBase64,
      RspImgType: "base64",
      Scene: "GEN"
    };
    console.log("[segmentPortrait] 开始调用 SegmentPortraitPic API");
    console.log("[segmentPortrait] API 参数:", {
      RspImgType: params.RspImgType,
      Scene: params.Scene,
      imageBase64Length: imageBase64.length,
      imageLooksJpeg: imageBase64.indexOf("/9j/") === 0,
      imageLooksPng: imageBase64.indexOf("iVBORw") === 0
    });

    const result = await client.SegmentPortraitPic(params);
    console.log("[segmentPortrait] API 调用成功, RequestId:", result && result.RequestId);

    const resultImage = stripBase64(result && (result.ResultImage || result.resultImage));
    if (!resultImage) {
      return { code: "API_EMPTY", message: "抠图服务未返回结果图" };
    }

    const resultBuffer = Buffer.from(resultImage, "base64");
    const cloudPath = "poster/seg_result_" + Date.now() + ".png";
    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: resultBuffer
    });
    console.log("[segmentPortrait] 结果保存成功:", uploadResult.fileID);

    return {
      code: "SUCCESS",
      resultFileID: uploadResult.fileID,
      requestId: result.RequestId || result.requestId || ""
    };
  } catch (err) {
    const detail = describeApiError(err);
    console.error("[segmentPortrait] 处理失败:", detail);
    return {
      code: "API_ERROR",
      message: detail.message || "抠图服务异常",
      detail: detail.code || ""
    };
  }
};
