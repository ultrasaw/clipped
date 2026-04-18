const crypto = require("node:crypto");

function createSlug(value) {
  return String(value || "room")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "room";
}

function createRoomId(name) {
  return `${createSlug(name)}-${crypto.randomUUID().slice(0, 8)}`;
}

function createRoomStore({ createRuntime }) {
  const runtimes = new Map();

  function createRoom(options = {}) {
    const id = options.id || createRoomId(options.name);

    if (runtimes.has(id)) {
      throw new Error(`Room already exists: ${id}`);
    }

    const runtime = createRuntime({
      ...options,
      id,
    });

    runtimes.set(id, runtime);
    return runtime;
  }

  function getRoom(id) {
    return runtimes.get(id) || null;
  }

  function listRooms() {
    return [...runtimes.values()];
  }

  function deleteRoom(id) {
    return runtimes.delete(id);
  }

  function getClientCount() {
    return listRooms().reduce((total, runtime) => total + runtime.clients.size, 0);
  }

  return {
    createRoom,
    getRoom,
    deleteRoom,
    listRooms,
    getClientCount,
  };
}

module.exports = {
  createRoomStore,
};
