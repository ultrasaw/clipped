const test = require("node:test");
const assert = require("node:assert/strict");

const { applyAction, createDemoRoom } = require("../src/game");

test("room stays in the lobby until the required second human joins", async () => {
  const room = createDemoRoom();
  const result = await applyAction(
    room,
    {
      type: "JOIN_ROOM",
      name: "Ava",
    },
    {
      connectionId: "conn-1",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(room.phase, "lobby");
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].role, "human");
  assert.equal(room.phaseStartedAt, null);
  assert.equal(room.phaseEndsAt, null);
});

test("room starts immediately when the second human joins", async () => {
  const room = createDemoRoom();

  await applyAction(
    room,
    {
      type: "JOIN_ROOM",
      name: "Ava",
    },
    {
      connectionId: "conn-1",
    },
  );

  const result = await applyAction(
    room,
    {
      type: "JOIN_ROOM",
      name: "Bea",
    },
    {
      connectionId: "conn-2",
    },
  );

  assert.equal(result.ok, true);
  assert.ok(result.playerId);
  assert.equal(room.phase, "spark");
  assert.equal(room.round, 1);
  assert.equal(room.players.length, 6);
  assert.deepEqual(
    room.players.slice(0, 2).map((player) => ({ name: player.name, role: player.role })),
    [
      { name: "Ava", role: "human" },
      { name: "Bea", role: "human" },
    ],
  );
  assert.ok(room.phaseStartedAt);
  assert.ok(room.phaseEndsAt);
  assert.equal(room.events.some((event) => event.type === "GAME_STARTED"), true);
  assert.equal(room.events.some((event) => event.type === "LOBBY_AUTOSTART_SCHEDULED"), false);
});
