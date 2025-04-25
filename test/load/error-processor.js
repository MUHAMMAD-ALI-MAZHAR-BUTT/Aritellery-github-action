// test/load/configs/error-processor.js
const fs = require("fs");
const path = require("path");

module.exports = { captureErrorResponses };

// Initialize error tracking structures
const errorReports = {
  signet: { csv: [], log: [] },
  mainnet: { csv: [], log: [] },
  unknown: { csv: [], log: [] },
};

function captureErrorResponses(requestParams, response, context, ee, next) {
  try {
    const statusCode = response.statusCode || 0;

    // Capture all non-2xx responses and explicit errors
    if (
      statusCode >= 300 ||
      (response.body && response.body.success === false)
    ) {
      const environment = detectEnvironment(context);
      const timestamp = new Date().toISOString();
      const endpoint = requestParams.url.split("/").pop() || "unknown";

      // Build error entry
      const errorEntry = {
        timestamp,
        environment,
        status: statusCode,
        url: `${context.vars.target}${requestParams.url}`,
        request: {
          method: requestParams.method,
          headers: requestParams.headers,
          body: requestParams.json || {},
        },
        response: {
          headers: response.headers,
          body: response.body,
        },
      };

      // Add to CSV and log reports
      errorReports[environment].csv.push([
        statusCode,
        errorEntry.url,
        timestamp,
      ]);

      errorReports[environment].log.push(formatLogEntry(errorEntry));
    }
  } catch (error) {
    console.error("Error processing response:", error);
  } finally {
    next();
  }
}

// Helper functions
function detectEnvironment(context) {
  const target = (context.vars.target || "").toLowerCase();
  if (target.includes("signet")) return "signet";
  if (target.includes("mainnet")) return "mainnet";
  return "unknown";
}

function formatLogEntry(entry) {
  return `==========================
[${entry.timestamp}]
Environment: ${entry.environment}
Status: ${entry.status}
URL: ${entry.url}
Request Body:
${JSON.stringify(entry.request.body, null, 2)}
Response Body:
${
  typeof entry.response.body === "object"
    ? JSON.stringify(entry.response.body, null, 2)
    : entry.response.body
}
`;
}

// Artillery hook to save reports after test completion
module.exports.afterScenario = function (context, events, done) {
  try {
    const reportsDir = path.join(__dirname, "..", "reports");
    if (!fs.existsSync(reportsDir))
      fs.mkdirSync(reportsDir, { recursive: true });

    // Save reports for each environment
    Object.entries(errorReports).forEach(([env, data]) => {
      if (data.csv.length > 0) {
        const csvHeader = "status_code,endpoint,timestamp\n";
        const csvContent =
          csvHeader + data.csv.map((row) => row.join(",")).join("\n");
        fs.writeFileSync(
          path.join(reportsDir, `${env}-errors.csv`),
          csvContent
        );
      }

      if (data.log.length > 0) {
        fs.writeFileSync(
          path.join(reportsDir, `${env}-detailed-errors.log`),
          data.log.join("\n")
        );
      }
    });
  } catch (error) {
    console.error("Error saving reports:", error);
  } finally {
    done();
  }
};
