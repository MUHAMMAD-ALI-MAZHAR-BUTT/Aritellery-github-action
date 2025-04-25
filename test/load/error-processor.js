const fs = require("fs");
const path = require("path");

module.exports = {
  captureErrorResponses: (requestParams, response, context, ee, next) => {
    try {
      // Get environment from Artillery context or target URL
      const environment =
        process.env.ENV ||
        (context.vars.target?.includes("signet")
          ? "signet"
          : context.vars.target?.includes("mainnet")
          ? "mainnet"
          : "unknown");

      // Capture essential elements for logging
      const errorData = {
        timestamp: new Date().toISOString(),
        environment: environment,
        statusCode: response?.statusCode || 0,
        url: `${context.vars.target}${requestParams?.url || "/unknown-path"}`,
        requestBody: context.vars.$loopElement
          ? JSON.stringify(context.vars.$loopElement, null, 2)
          : "{}",
        responseBody: response?.body
          ? JSON.stringify(response.body, null, 2)
          : "{}",
      };

      // Create formatted log entry
      const logEntry = [
        "==========================",
        `[${errorData.timestamp}]`,
        `Environment: ${errorData.environment}`,
        `Status: ${errorData.statusCode}`,
        `URL: ${errorData.url}`,
        "Request Body:",
        errorData.requestBody,
        "Response Body:",
        errorData.responseBody,
        "",
      ].join("\n");

      // Initialize errors array if not exists
      if (!context.vars.errors) {
        context.vars.errors = [];
      }

      // Store error entry for later processing
      context.vars.errors.push(logEntry);
    } catch (error) {
      console.error("Error processing response:", error);
    } finally {
      next(); // Ensure next() is always called
    }
  },

  hooks: {
    afterScenario: (context, events, done) => {
      try {
        if (context.vars.errors?.length > 0) {
          const reportsDir = path.join(__dirname, "reports");
          if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
          }

          const logFileName = `errors-${process.env.ENV}-${Date.now()}.log`;
          const logPath = path.join(reportsDir, logFileName);

          // Write all accumulated errors
          fs.writeFileSync(logPath, context.vars.errors.join("\n"));

          // Add to artillery report context
          context.vars.detailedErrorLog = logPath;
        }
      } catch (error) {
        console.error("Error writing error log:", error);
      } finally {
        done(); // Ensure done() is always called
      }
    },
  },
};
