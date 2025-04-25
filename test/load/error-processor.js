const fs = require("fs");
const path = require("path");

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const createdLogFiles = {};

function captureErrorResponses(requestParams, response, context, ee, next) {
  const isError =
    response.statusCode !== 200 ||
    (response.body && response.body.success === false);

  if (!isError) return next();

  let environment = "unknown";

  if (context.vars.$environment) {
    environment = context.vars.$environment;
  } else if (context.vars.target) {
    const target = context.vars.target.toLowerCase();
    if (target.includes("signet")) environment = "signet";
    else if (target.includes("mainnet")) environment = "mainnet";
  }

  const envLogsDir = path.join(logsDir, environment);
  if (!fs.existsSync(envLogsDir)) {
    fs.mkdirSync(envLogsDir, { recursive: true });
  }

  const endpoint = requestParams.url.split("/").pop();
  const logFilePath = path.join(envLogsDir, `${endpoint}-errors.log`);

  if (!createdLogFiles[logFilePath]) {
    fs.writeFileSync(logFilePath, "");
    createdLogFiles[logFilePath] = true;
  }

  const timestamp = new Date().toISOString();

  let logEntry = `==========================\n`;
  logEntry += `[${timestamp}]\n`;
  logEntry += `Environment: ${environment}\n`;
  logEntry += `Status: ${response.statusCode}\n`;
  logEntry += `URL: ${context.vars.target}${requestParams.url}\n`;

  // Capture actual request body from requestParams
  const requestBody = requestParams.json || {};
  logEntry += `Request Body:\n${JSON.stringify(requestBody, null, 2)}\n`;

  // Handle response body parsing
  let responseBodyText = "";
  try {
    responseBodyText =
      typeof response.body === "object"
        ? JSON.stringify(response.body, null, 2)
        : response.body;
  } catch (err) {
    responseBodyText = response.body;
  }
  logEntry += `Response Body:\n${responseBodyText}\n`;

  fs.appendFileSync(logFilePath, logEntry + "\n");

  return next();
}

module.exports = {
  captureErrorResponses,
  setupTest: function () {},
};
