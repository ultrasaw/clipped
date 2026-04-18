const phaseTitle = document.querySelector("#phaseTitle");
const phaseMeta = document.querySelector("#phaseMeta");
const connectionStatus = document.querySelector("#connectionStatus");
const viewerBriefing = document.querySelector("#viewerBriefing");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const startButton = document.querySelector("#startButton");
const advanceButton = document.querySelector("#advanceButton");
const resetButton = document.querySelector("#resetButton");
const playersEl = document.querySelector("#players");
const playerCount = document.querySelector("#playerCount");
const sparkPanel = document.querySelector("#sparkPanel");
const votePanel = document.querySelector("#votePanel");
const messagesEl = document.querySelector("#messages");
const actionForm = document.querySelector("#actionForm");
const actionLabel = document.querySelector("#actionLabel");
const actionInput = document.querySelector("#actionInput");
const sendButton = document.querySelector("#sendButton");

let state = null;
let events = null;
let playerId = localStorage.getItem("clipped:playerId");
const isDevMode = new URLSearchParams(window.location.search).get("dev") === "1";

nameInput.value = localStorage.getItem("clipped:name") || "";
document.body.classList.toggle("dev-mode", isDevMode);

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

function connectEvents() {
  if (events) {
    events.close();
  }

  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  events = new EventSource(`/events${query}`);

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

  phaseTitle.textContent = `${label}${state.round ? ` / Round ${state.round}` : ""}`;
  phaseMeta.textContent = state.result
    ? state.result.summary
    : state.phaseEndsAt
      ? `Phase ends around ${formatTime(state.phaseEndsAt)}`
      : "Waiting for players.";

  viewerBriefing.textContent = viewer
    ? viewer.briefing || `You are ${viewer.name}.`
    : "Join the lobby to receive your role briefing.";

  renderPlayers();
  renderSpark();
  renderMessages();
  renderVote();
  renderActionForm();

  startButton.disabled = state.phase !== "lobby";
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

    name.textContent = `${player.name}${player.isYou ? " (you)" : ""}`;
    status.textContent = player.revealedRole || player.status;

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
      return `<li><strong>${escapeHtml(player ? player.name : "Unknown")}:</strong> ${escapeHtml(answer)}</li>`;
    })
    .join("");

  sparkPanel.innerHTML = `
    <p class="eyebrow">Spark</p>
    <h3>${escapeHtml(state.sparkPrompt || "Spark answers")}</h3>
    ${answers ? `<ul>${answers}</ul>` : "<p>Answers are hidden until reveal.</p>"}
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

  actionLabel.textContent = config.label;
  actionInput.placeholder = !isTiebreakStatementForViewer
    ? "Waiting for tied players..."
    : alreadySubmitted
      ? "Submitted. Waiting for the room..."
      : config.placeholder;
  actionInput.disabled = !canAct;
  sendButton.disabled = !canAct;
  sendButton.textContent = alreadySubmitted ? "Waiting" : config.button;
}

async function postAction(action) {
  const response = await fetch("/actions", {
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
    localStorage.setItem("clipped:playerId", playerId);
    connectEvents();
  }
});

startButton.addEventListener("click", () => {
  postAction({ type: "START_GAME" });
});

advanceButton.addEventListener("click", () => {
  postAction({ type: "ADVANCE_PHASE" });
});

resetButton.addEventListener("click", async () => {
  localStorage.removeItem("clipped:playerId");
  playerId = null;
  await postAction({ type: "RESET_ROOM" });
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

connectEvents();
