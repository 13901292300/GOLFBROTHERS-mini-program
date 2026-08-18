module.exports = {
  segmentationMode: "local",
  localSegmentationModel: {
    url: "https://huggingface.co/onnx-community/modnet-webnn/resolve/6af52070d14deafc5e55ce6cc4d752a322cdff76/onnx/model.onnx?download=true",
    fileName: "golf-modnet-fp32-v2.onnx",
    expectedBytes: 25888640,
    inputSize: 512,
    outputMaxEdge: 1600,
    precisionLevel: 1,
    allowNPU: false,
    normalization: "minus-one-one",
    inputName: "input",
    outputName: "output",
    source: "local",
    headers: {},
    fallbackModel: {
      packagePath: "/models/mediapipe-selfie-wechat.onnx",
      inputSize: 256,
      normalization: "zero-one",
      inputName: "pixel_values",
      outputName: "alphas",
      source: "mediapipe",
      allowNPU: false
    }
  },
  // Optional remote fallback. Leave empty for a fully local, free workflow.
  segmentationEndpoint: "",
  segmentationHeaders: {},
  segmentationQuality: "hd"
};
