const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LOG_LEVEL = String(process.env.LOG_LEVEL || "debug").toLowerCase();
const activeLevel = LEVELS[LOG_LEVEL] || LEVELS.debug;

function timestamp() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function serializeMeta(meta = {}) {
  return Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      if (typeof value === "object") {
        return `${key}=${JSON.stringify(value)}`;
      }

      return `${key}=${String(value)}`;
    })
    .join(" ");
}

function log(level, message, meta) {
  if (LEVELS[level] < activeLevel) {
    return;
  }

  const prefix = `[${timestamp()}] ${level.toUpperCase().padEnd(5)}`;
  const details = serializeMeta(meta);

  console.log(details ? `${prefix} ${message} ${details}` : `${prefix} ${message}`);
}

module.exports = {
  debug: (message, meta) => log("debug", message, meta),
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),
};
