const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#chatForm");
const senderInput = document.querySelector("#senderInput");
const messageInput = document.querySelector("#messageInput");
const connectionStatus = document.querySelector("#connectionStatus");

const savedName = localStorage.getItem("clipped:name");

if (savedName) {
  senderInput.value = savedName;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function renderMessage(message) {
  if (document.querySelector(`[data-message-id="${message.id}"]`)) {
    return;
  }

  const item = document.createElement("li");
  const sender = document.createElement("span");
  const time = document.createElement("span");
  const meta = document.createElement("div");
  const text = document.createElement("div");

  item.className = "message";
  item.dataset.messageId = message.id;

  if (message.sender === senderInput.value.trim()) {
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
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setConnectionStatus(label, isConnected) {
  connectionStatus.textContent = label;
  connectionStatus.classList.toggle("connected", isConnected);
}

const events = new EventSource("/events");

events.addEventListener("open", () => {
  setConnectionStatus("Connected", true);
});

events.addEventListener("error", () => {
  setConnectionStatus("Reconnecting", false);
});

events.addEventListener("snapshot", (event) => {
  const payload = JSON.parse(event.data);
  messagesEl.innerHTML = "";
  payload.messages.forEach(renderMessage);
});

events.addEventListener("message", (event) => {
  renderMessage(JSON.parse(event.data));
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const sender = senderInput.value.trim();
  const text = messageInput.value.trim();

  if (!sender || !text) {
    return;
  }

  localStorage.setItem("clipped:name", sender);
  messageInput.value = "";
  messageInput.focus();

  const response = await fetch("/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ sender, text }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    window.alert(payload.error || "Message could not be sent.");
  }
});
