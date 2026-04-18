const roomsScreen = document.querySelector("#roomsScreen");
const gameShell = document.querySelector("#gameShell");
const roomsList = document.querySelector("#roomsList");
const refreshRoomsButton = document.querySelector("#refreshRoomsButton");
const createRoomForm = document.querySelector("#createRoomForm");
const roomNameInput = document.querySelector("#roomNameInput");
const humansRequiredInput = document.querySelector("#humansRequiredInput");
const maxRoundsInput = document.querySelector("#maxRoundsInput");
const chatDurationInput = document.querySelector("#chatDurationInput");
const roomLabel = document.querySelector("#roomLabel");
const phaseTitle = document.querySelector("#phaseTitle");
const phaseMeta = document.querySelector("#phaseMeta");
const connectionStatus = document.querySelector("#connectionStatus");
const viewerBriefing = document.querySelector("#viewerBriefing");
const lobbyScreen = document.querySelector("#lobbyScreen");
const gameScreen = document.querySelector("#gameScreen");
const resultsScreen = document.querySelector("#resultsScreen");
const lobbyTitle = document.querySelector("#lobbyTitle");
const lobbyDescription = document.querySelector("#lobbyDescription");
const lobbyCountdown = document.querySelector("#lobbyCountdown");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const advanceButton = document.querySelector("#advanceButton");
const resetButton = document.querySelector("#resetButton");
const resultsResetButton = document.querySelector("#resultsResetButton");
const playersEl = document.querySelector("#players");
const playerCount = document.querySelector("#playerCount");
const phasePanel = document.querySelector("#phasePanel");
const sparkPanel = document.querySelector("#sparkPanel");
const votePanel = document.querySelector("#votePanel");
const messagesEl = document.querySelector("#messages");
const actionForm = document.querySelector("#actionForm");
const actionLabel = document.querySelector("#actionLabel");
const actionInput = document.querySelector("#actionInput");
const sendButton = document.querySelector("#sendButton");
const resultsTitle = document.querySelector("#resultsTitle");
const resultsSummary = document.querySelector("#resultsSummary");
const resultsDetails = document.querySelector("#resultsDetails");

let state = null;
let events = null;
let currentRoomId = getRoomIdFromLocation();
let playerId = currentRoomId ? localStorage.getItem(getPlayerStorageKey()) : null;
const isDevMode = new URLSearchParams(window.location.search).get("dev") === "1";

nameInput.value = localStorage.getItem("clipped:name") || "";
document.body.classList.toggle("dev-mode", isDevMode);

if (currentRoomId) {
  roomsScreen.classList.add("hidden");
  gameShell.classList.remove("hidden");
} else {
  roomsScreen.classList.remove("hidden");
  gameShell.classList.add("hidden");
}

const phaseLabels = {
  lobby: "Lobby",
  spark: "Spark",
  spark_reveal: "Spark Reveal",
  chat: "Open Chat",
  final_statements: "Final Statements",
  vote: "Vote",
  tiebreak_statements: "Tiebreak Statements",
  tiebreak_vote: "Tiebreak Vote",
  reveal: "Reveal",
  game_over: "Game Over",
};

const phaseCopy = {
  lobby: {
    kicker: "Gathering the room",
    title: "Waiting for the room",
    instruction: "Join with a name. Once two humans are in, the game starts automatically.",
  },
  spark: {
    kicker: "Quick instinct",
    title: "Answer the spark",
    instruction: "One short phrase is enough. Do not overthink it.",
  },
  spark_reveal: {
    kicker: "First evidence",
    title: "Spark answers revealed",
    instruction: "Read the room. These answers are just the first clues.",
  },
  chat: {
    kicker: "Open conversation",
    title: "Talk, test, accuse",
    instruction: "Question others, defend yourself, or quietly look for the other human.",
  },
  final_statements: {
    kicker: "Commit",
    title: "Final statements",
    instruction: "Give one read, defense, or accusation before the vote.",
  },
  vote: {
    kicker: "Elimination",
    title: "Vote someone out",
    instruction: "Pick whoever feels least convincingly human.",
  },
  tiebreak_statements: {
    kicker: "Tie",
    title: "Tied players defend themselves",
    instruction: "Only tied players speak now. Everyone else listens for the revote.",
  },
  tiebreak_vote: {
    kicker: "Break the tie",
    title: "Revote between tied players",
    instruction: "Tied players cannot vote. If this ties again, all top-tied players are ejected.",
  },
  reveal: {
    kicker: "Reveal",
    title: "The room learns the truth",
    instruction: "The ejected player is revealed. Watch what this changes.",
  },
  game_over: {
    kicker: "Game over",
    title: "The room has decided",
    instruction: "Review the result and reset in dev mode when ready.",
  },
};

function connectEvents() {
  if (!currentRoomId) {
    return;
  }

  if (events) {
    events.close();
  }

  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  events = new EventSource(`/api/rooms/${encodeURIComponent(currentRoomId)}/events${query}`);

  events.addEventListener("open", () => {
    setConnectionStatus("Connected", true);
  });

  events.addEventListener("error", () => {
    setConnectionStatus("Reconnecting", false);
  });

  events.addEventListener("state", (event) => {
    state = JSON.parse(event.data);
    renderState();
  });
}

function setConnectionStatus(label, isConnected) {
  connectionStatus.textContent = label;
  connectionStatus.classList.toggle("connected", isConnected);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatRemaining(timestamp) {
  if (!timestamp) {
    return "No timer";
  }

  const remainingMs = Math.max(0, timestamp - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${minutes}:${seconds} remaining`;
}

function getTimerProgress() {
  if (!state.phaseStartedAt || !state.phaseEndsAt) {
    return 100;
  }

  const totalMs = Math.max(1, state.phaseEndsAt - state.phaseStartedAt);
  const remainingMs = Math.max(0, state.phaseEndsAt - Date.now());

  return Math.round((remainingMs / totalMs) * 100);
}

function actionForPhase(phase) {
  if (phase === "spark") {
    return {
      type: "SUBMIT_SPARK",
      label: "Spark Answer",
      placeholder: "Short answer...",
      button: "Submit",
      enabled: true,
    };
  }

  if (phase === "chat") {
    return {
      type: "SEND_CHAT",
      label: "Chat",
      placeholder: "Say something suspiciously normal...",
      button: "Send",
      enabled: true,
    };
  }

  if (phase === "final_statements") {
    return {
      type: "SUBMIT_FINAL",
      label: "Final Statement",
      placeholder: "One read, defense, or accusation...",
      button: "Submit",
      enabled: true,
    };
  }

  if (phase === "tiebreak_statements") {
    return {
      type: "SUBMIT_TIEBREAK",
      label: "Tiebreak Statement",
      placeholder: "One last defense...",
      button: "Submit",
      enabled: true,
    };
  }

  return {
    type: null,
    label: "Message",
    placeholder: "No text action is available in this phase.",
    button: "Send",
    enabled: false,
  };
}

function renderState() {
  const viewer = state.viewer;
  const label = phaseLabels[state.phase] || state.phase;

  document.body.dataset.screen = getScreen();
  document.body.dataset.phase = state.phase;
  document.documentElement.dataset.screen = getScreen();
  document.documentElement.dataset.phase = state.phase;
  renderScreens();
  roomLabel.textContent = state.name || "Room";
  phaseTitle.textContent = `${label}${state.round ? ` / Round ${state.round}` : ""}`;
  phaseMeta.textContent = state.result
    ? state.result.summary
    : state.phaseEndsAt
      ? formatRemaining(state.phaseEndsAt)
      : "Waiting for players.";

  viewerBriefing.textContent = viewer
    ? viewer.briefing || `You are ${viewer.name}.`
    : "Join the lobby to receive your role briefing.";

  renderPlayers();
  renderPhasePanel();
  renderSpark();
  renderMessages();
  renderVote();
  renderActionForm();

}

function getScreen() {
  if (state.phase === "game_over") {
    return "results";
  }

  if (state.phase === "lobby") {
    return "lobby";
  }

  return "game";
}

function renderScreens() {
  const screen = getScreen();

  lobbyScreen.classList.toggle("hidden", screen !== "lobby");
  gameScreen.classList.toggle("hidden", screen !== "game");
  resultsScreen.classList.toggle("hidden", screen !== "results");

  if (screen === "lobby") {
    renderLobby();
  }

  if (screen === "results") {
    renderResults();
  }
}

function renderLobby() {
  const humanPlayers = state.players.filter((player) => !player.revealedRole);
  const joinedCount = humanPlayers.length;
  const needed = Math.max(0, 2 - joinedCount);

  if (state.phaseEndsAt) {
    lobbyTitle.textContent = "Game starts soon";
    lobbyDescription.textContent =
      "Two humans are in. Get ready. The room will fill with AI voices when the countdown ends.";
    renderLobbyCountdown();
    return;
  }

  lobbyTitle.textContent = needed ? "Join the demo room" : "Ready to begin";
  lobbyDescription.textContent = needed
    ? `${needed} more human player${needed === 1 ? "" : "s"} needed before the countdown starts.`
    : "The game will start automatically in a moment.";
  lobbyCountdown.classList.add("hidden");
  lobbyCountdown.innerHTML = "";
}

function renderLobbyCountdown() {
  if (!state.phaseEndsAt) {
    lobbyCountdown.classList.add("hidden");
    lobbyCountdown.innerHTML = "";
    return;
  }

  const remainingMs = Math.max(0, state.phaseEndsAt - Date.now());
  const seconds = Math.ceil(remainingMs / 1000);
  const progress = getTimerProgress();

  lobbyCountdown.classList.remove("hidden");
  lobbyCountdown.innerHTML = `
    <div class="countdown-copy">
      <span>Starting in</span>
      <strong>${String(seconds).padStart(2, "0")}</strong>
      <span>seconds</span>
    </div>
    <div class="countdown-track" aria-hidden="true">
      <span class="countdown-fill" style="width: ${progress}%"></span>
    </div>
  `;
}

function renderResults() {
  const result = state.result;

  resultsTitle.textContent = result ? result.summary : "Game over";
  resultsSummary.textContent = result
    ? `${result.winner.toUpperCase()} result / ${result.level} outcome`
    : "The room has decided.";

  const ejectedPlayers = state.players.filter((player) => player.status === "ejected");

  resultsDetails.innerHTML = `
    <p class="eyebrow">Eliminations</p>
    ${
      ejectedPlayers.length
        ? `<ol>${ejectedPlayers
            .map(
              (player) =>
                `<li><strong>${escapeHtml(player.name)}</strong> revealed as ${escapeHtml(
                  player.revealedRole || "unknown",
                )}</li>`,
            )
            .join("")}</ol>`
        : "<p>No players were ejected.</p>"
    }
  `;
}

function renderPhasePanel() {
  const copy = {
    ...(phaseCopy[state.phase] || {
      kicker: "Phase",
      title: phaseLabels[state.phase] || state.phase,
      instruction: "Follow the current room prompt.",
    }),
  };

  if (state.phase === "lobby" && state.phaseEndsAt) {
    copy.kicker = "Get ready";
    copy.title = "Game starts soon";
    copy.instruction = "Two humans are in. The room will fill with AI participants automatically.";
  }

  const tiedPlayers = state.players.filter((player) => state.tiebreakPlayerIds?.includes(player.id));
  const tiedNames = tiedPlayers.map((player) => player.name).join(", ");
  const timer = state.phaseEndsAt ? formatRemaining(state.phaseEndsAt) : "Manual / waiting";
  const progress = getTimerProgress();

  phasePanel.innerHTML = `
    <div>
      <p class="eyebrow">${escapeHtml(copy.kicker)}</p>
      <h3>${escapeHtml(copy.title)}</h3>
      <p>${escapeHtml(copy.instruction)}</p>
      ${
        tiedNames
          ? `<p class="phase-warning">Tied: ${escapeHtml(tiedNames)}</p>`
          : ""
      }
    </div>
    <div class="phase-timer">
      <span id="phaseTimer" class="timer-pill">${escapeHtml(timer)}</span>
      ${
        state.phaseEndsAt
          ? `<div class="mini-timer-track" aria-hidden="true"><span id="phaseTimerFill" style="width: ${progress}%"></span></div>`
          : ""
      }
    </div>
  `;
}

function renderPlayers() {
  playerCount.textContent = state.players.length;
  playersEl.innerHTML = "";

  for (const player of state.players) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const status = document.createElement("span");

    item.className = "player";
    item.classList.toggle("ejected", player.status === "ejected");
    item.classList.toggle("you", player.isYou);
    item.classList.toggle("tied", state.tiebreakPlayerIds?.includes(player.id));
    name.className = "player-name";
    status.className = "player-status";

    name.textContent = `${player.name}${player.isYou ? " (you)" : ""}`;
    status.textContent = state.tiebreakPlayerIds?.includes(player.id)
      ? "TIED"
      : player.revealedRole || player.status;

    item.append(name, status);
    playersEl.append(item);
  }
}

function renderSpark() {
  if (!state.sparkPrompt && Object.keys(state.sparkAnswers).length === 0) {
    sparkPanel.classList.add("hidden");
    sparkPanel.innerHTML = "";
    return;
  }

  sparkPanel.classList.remove("hidden");

  const answers = Object.entries(state.sparkAnswers)
    .map(([id, answer]) => {
      const player = state.players.find((candidate) => candidate.id === id);
      return `
        <article class="spark-answer-card">
          <span>${escapeHtml(player ? player.name : "Unknown")}</span>
          <strong>${escapeHtml(answer)}</strong>
        </article>
      `;
    })
    .join("");

  sparkPanel.innerHTML = `
    <div class="spark-prompt">
      <p class="eyebrow">Spark</p>
      <h3>${escapeHtml(state.sparkPrompt || "Spark answers")}</h3>
    </div>
    <div class="spark-answers">
      ${answers ? answers : "<p>Answers are hidden until reveal.</p>"}
    </div>
  `;
}

function renderMessages() {
  messagesEl.innerHTML = "";

  for (const message of state.messages) {
    const item = document.createElement("li");
    const sender = document.createElement("span");
    const time = document.createElement("span");
    const meta = document.createElement("div");
    const text = document.createElement("div");

    item.className = `message ${message.kind || "chat"}`;

    if (state.viewer && message.playerId === state.viewer.id) {
      item.classList.add("own");
    }

    meta.className = "message-meta";
    sender.textContent = message.sender;
    time.textContent = formatTime(message.createdAt);

    text.className = "message-text";
    text.textContent = message.text;

    meta.append(sender, time);
    item.append(meta, text);
    messagesEl.append(item);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderVote() {
  if ((state.phase !== "vote" && state.phase !== "tiebreak_vote") || !state.viewer) {
    votePanel.classList.add("hidden");
    votePanel.innerHTML = "";
    return;
  }

  const isTiebreak = state.phase === "tiebreak_vote";
  const viewerIsTied = isTiebreak && state.tiebreakPlayerIds.includes(state.viewer.id);
  const targets = state.players.filter((player) => {
    if (player.status !== "alive") {
      return false;
    }

    if (isTiebreak) {
      return state.tiebreakPlayerIds.includes(player.id);
    }

    return player.id !== state.viewer.id;
  });
  const hasVoted = isTiebreak ? state.viewer.submissions.tiebreakVote : state.viewer.submissions.vote;
  const disabled = hasVoted || viewerIsTied;
  const title = (() => {
    if (viewerIsTied) {
      return "You are tied. Other players are voting.";
    }

    if (hasVoted) {
      return "Vote submitted. Waiting for the room...";
    }

    return isTiebreak ? "Break the tie. Choose one tied player." : "Who feels least convincingly human?";
  })();

  votePanel.classList.remove("hidden");
  votePanel.innerHTML = `
    <p class="eyebrow">${isTiebreak ? "Tiebreak Vote" : "Vote"}</p>
    <h3>${title}</h3>
    <div class="vote-grid">
      ${targets
        .map(
          (player) => `
            <button class="vote-card" data-target-id="${player.id}" type="button" ${disabled ? "disabled" : ""}>
              ${escapeHtml(player.name)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderActionForm() {
  const config = actionForPhase(state.phase);
  const alreadySubmitted =
    state.viewer &&
    ((state.phase === "spark" && state.viewer.submissions.spark) ||
      (state.phase === "final_statements" && state.viewer.submissions.finalStatement) ||
      (state.phase === "tiebreak_statements" && state.viewer.submissions.tiebreakStatement));
  const isTiebreakStatementForViewer =
    state.phase !== "tiebreak_statements" || state.tiebreakPlayerIds.includes(state.viewer?.id);
  const canAct = Boolean(state.viewer && config.enabled && !alreadySubmitted && isTiebreakStatementForViewer);

  actionLabel.textContent = getActionLabel(config.label);
  actionInput.placeholder = !isTiebreakStatementForViewer
    ? "Waiting for tied players..."
    : alreadySubmitted
      ? "Submitted. Waiting for the room..."
      : config.placeholder;
  actionInput.disabled = !canAct;
  sendButton.disabled = !canAct;
  sendButton.textContent = alreadySubmitted ? "Waiting" : config.button;
}

function getActionLabel(defaultLabel) {
  if (!state.viewer) {
    return "Join first";
  }

  if (state.phase === "tiebreak_statements" && !state.tiebreakPlayerIds.includes(state.viewer.id)) {
    return "Waiting for tied players";
  }

  if (state.phase === "tiebreak_vote" && state.tiebreakPlayerIds.includes(state.viewer.id)) {
    return "The room is deciding";
  }

  return defaultLabel;
}

async function postAction(action) {
  const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoomId)}/actions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ playerId, action }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    window.alert(payload.error || "Action failed.");
  }

  return payload;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char];
  });
}

function getRoomIdFromLocation() {
  const pathMatch = window.location.pathname.match(/^\/rooms\/([^/]+)$/);

  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }

  return new URLSearchParams(window.location.search).get("room");
}

function getPlayerStorageKey() {
  return `clipped:room:${currentRoomId}:playerId`;
}

async function loadRooms() {
  const response = await fetch("/api/rooms");
  const payload = await response.json();

  if (!payload.ok) {
    roomsList.innerHTML = `<p>Could not load rooms.</p>`;
    return;
  }

  renderRooms(payload.rooms);
}

function renderRooms(rooms) {
  if (!rooms.length) {
    roomsList.innerHTML = "<p>No rooms yet. Create the first one.</p>";
    return;
  }

  roomsList.innerHTML = rooms
    .map(
      (room) => `
        <a class="room-card" href="/rooms/${encodeURIComponent(room.id)}">
          <div>
            <h3>${escapeHtml(room.name)}</h3>
            <div class="room-meta">
              <span class="room-pill">${escapeHtml(phaseLabels[room.phase] || room.phase)}</span>
              <span class="room-pill">${room.humansJoined}/${room.humansRequired} humans</span>
              <span class="room-pill">Round ${room.round}/${room.maxRounds}</span>
              <span class="room-pill">${room.chatDurationSeconds}s chat</span>
            </div>
          </div>
          <span class="room-action">${room.canJoin ? "Join" : "Watch"}</span>
        </a>
      `,
    )
    .join("");
}

async function createRoom(event) {
  event.preventDefault();

  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: roomNameInput.value.trim() || "New Room",
      config: {
        humansRequired: humansRequiredInput.value,
        maxRounds: maxRoundsInput.value,
        chatDurationSeconds: chatDurationInput.value,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.ok) {
    window.alert(payload.error || "Could not create room.");
    return;
  }

  window.location.href = `/rooms/${encodeURIComponent(payload.room.id)}`;
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();

  if (!name) {
    return;
  }

  localStorage.setItem("clipped:name", name);

  const result = await postAction({
    type: "JOIN_ROOM",
    name,
  });

  if (result.ok && result.playerId) {
    playerId = result.playerId;
    localStorage.setItem(getPlayerStorageKey(), playerId);
    connectEvents();
  }
});

advanceButton.addEventListener("click", () => {
  postAction({ type: "ADVANCE_PHASE" });
});

resetButton.addEventListener("click", async () => {
  localStorage.removeItem(getPlayerStorageKey());
  playerId = null;
  await fetch(`/api/rooms/${encodeURIComponent(currentRoomId)}/admin/reset`, { method: "POST" });
  connectEvents();
});

resultsResetButton.addEventListener("click", async () => {
  localStorage.removeItem(getPlayerStorageKey());
  playerId = null;
  await fetch(`/api/rooms/${encodeURIComponent(currentRoomId)}/admin/reset`, { method: "POST" });
  connectEvents();
});

actionForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const config = actionForPhase(state.phase);
  const text = actionInput.value.trim();

  if (!config.type || !text) {
    return;
  }

  actionInput.value = "";
  actionInput.focus();

  postAction({
    type: config.type,
    text,
  });
});

votePanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-target-id]");

  if (!button) {
    return;
  }

  postAction({
    type: state.phase === "tiebreak_vote" ? "CAST_TIEBREAK_VOTE" : "CAST_VOTE",
    targetId: button.dataset.targetId,
  });
});

refreshRoomsButton.addEventListener("click", loadRooms);
createRoomForm.addEventListener("submit", createRoom);

if (currentRoomId) {
  connectEvents();
} else {
  document.body.dataset.screen = "rooms";
  document.documentElement.dataset.screen = "rooms";
  loadRooms();
}

setInterval(() => {
  if (!state) {
    return;
  }

  phaseMeta.textContent = state.result
    ? state.result.summary
    : state.phaseEndsAt
      ? formatRemaining(state.phaseEndsAt)
      : "Waiting for players.";

  const timer = document.querySelector("#phaseTimer");
  const timerFill = document.querySelector("#phaseTimerFill");

  if (timer) {
    timer.textContent = state.phaseEndsAt ? formatRemaining(state.phaseEndsAt) : "Manual / waiting";
  }

  if (timerFill) {
    timerFill.style.width = `${getTimerProgress()}%`;
  }

  if (state.phase === "lobby") {
    renderLobbyCountdown();
  }
}, 1000);
