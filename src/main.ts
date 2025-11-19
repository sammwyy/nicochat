
import tmi from "tmi.js";

import { EmoteFetcher } from './emote';
import { parseTwitchMessage, type MessageToken } from "./parser";
import { settings } from "./settings";

import './styles/fonts.css'
import './styles/app.css'

// DOM
const container = document.querySelector<HTMLDivElement>('#app')!;
const messageHistory: HTMLDivElement[] = [];

// Connection status UI
let statusIndicator: HTMLDivElement | null = null;
let errorMessage: HTMLDivElement | null = null;

const recentYPositions: number[] = [];
const MIN_DISTANCE = 50;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 20;
const MAX_TRIES = 100;

function getRandomY(): number {
  const maxY = window.innerHeight - MARGIN_BOTTOM - 30;
  const minY = MARGIN_TOP;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const randomY = Math.random() * (maxY - minY) + minY;

    const isFarEnough = recentYPositions.every(prevY =>
      Math.abs(randomY - prevY) >= MIN_DISTANCE
    );

    if (isFarEnough) {
      recentYPositions.push(randomY);
      if (recentYPositions.length > 3) {
        recentYPositions.shift();
      }
      return randomY;
    }
  }

  const fallbackY = Math.random() * (maxY - minY) + minY;
  recentYPositions.push(fallbackY);
  if (recentYPositions.length > 3) {
    recentYPositions.shift();
  }
  return fallbackY;
}

function spawnMessage(author: string, authorColor: string | undefined, messageTokens: MessageToken[]) {
  const element = document.createElement("div");
  const usernameElement = document.createElement("span");
  const messageElement = document.createElement("span");

  usernameElement.innerText = `${author}:`;
  for (const token of messageTokens) {
    if (token.type == "text") {
      const tokenElement = document.createElement("span");
      tokenElement.innerText = token.text;
      tokenElement.classList.add("message-token-text");
      tokenElement.style.color = settings.messageTextColor;
      messageElement.appendChild(tokenElement);
    } else if (token.type == "emote") {
      const tokenElement = document.createElement("img");
      const urls = token.emote.url;
      tokenElement.src = urls.high || urls.mid || urls.low;
      tokenElement.classList.add("message-token-emote");
      messageElement.append(tokenElement);
    }
  }

  element.classList.add("message");
  element.appendChild(usernameElement);
  element.appendChild(messageElement);

  usernameElement.classList.add("message-username");
  usernameElement.style.color = authorColor || "#000";

  messageElement.classList.add("message-content");

  const randomY = getRandomY();
  element.style.top = `${randomY}px`;

  container.appendChild(element);
  messageHistory.push(element);

  element.addEventListener('animationend', () => {
    element.remove();
    const index = messageHistory.indexOf(element);
    if (index > -1) {
      messageHistory.splice(index, 1);
    }
  });
}

// Connection status management
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

function createStatusIndicator(): HTMLDivElement {
  const indicator = document.createElement("div");
  indicator.id = "connection-status";
  indicator.classList.add("connection-status");
  indicator.classList.add("status-connecting");
  indicator.textContent = "Connecting...";
  container.appendChild(indicator);
  return indicator;
}

function updateStatus(status: ConnectionStatus, message?: string) {
  if (!statusIndicator) {
    statusIndicator = createStatusIndicator();
  }

  // Remove all status classes
  statusIndicator.classList.remove("status-connecting", "status-connected", "status-disconnected", "status-error");

  // Add current status class
  statusIndicator.classList.add(`status-${status}`);

  switch (status) {
    case 'connecting':
      statusIndicator.textContent = "Connecting...";
      statusIndicator.style.display = "block";
      break;
    case 'connected':
      statusIndicator.textContent = "Connected";
      // Hide after 2 seconds when connected
      setTimeout(() => {
        if (statusIndicator && statusIndicator.classList.contains("status-connected")) {
          statusIndicator.style.display = "none";
        }
      }, 2000);
      break;
    case 'disconnected':
      statusIndicator.textContent = "Disconnected";
      statusIndicator.style.display = "block";
      break;
    case 'error':
      statusIndicator.textContent = message || "Connection Error";
      statusIndicator.style.display = "block";
      break;
  }
}

function showError(message: string) {
  if (!errorMessage) {
    errorMessage = document.createElement("div");
    errorMessage.id = "error-message";
    errorMessage.classList.add("error-message");
    container.appendChild(errorMessage);
  }
  errorMessage.textContent = message;
  errorMessage.style.display = "block";

  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (errorMessage) {
      errorMessage.style.display = "none";
    }
  }, 5000);
}

function hideError() {
  if (errorMessage) {
    errorMessage.style.display = "none";
  }
}

// Emotes
const emotes = new EmoteFetcher();
emotes.fetchEmotes(settings.channel).catch((error) => {
  console.error("Failed to fetch emotes:", error);
  // Non-critical, continue without emotes
});

// Chat client
const client = new tmi.Client({
  channels: [settings.channel],
  connection: {
    reconnect: false, // We'll handle reconnection manually
    secure: true,
  },
});

// Reconnection logic
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
let reconnectTimeout: number | null = null;

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    updateStatus('error', `Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    showError(`Unable to connect to channel "${settings.channel}". Please check the channel name.`);
    return;
  }

  const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts); // Exponential backoff
  reconnectAttempts++;

  updateStatus('connecting', `Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  reconnectTimeout = window.setTimeout(() => {
    try {
      client.connect();
    } catch (error) {
      console.error("Reconnection error:", error);
      scheduleReconnect();
    }
  }, delay);
}

function resetReconnectAttempts() {
  reconnectAttempts = 0;
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

// Connection event handlers
let joinTimeout: number | null = null;
const JOIN_TIMEOUT = 5000; // 5 seconds to join channel after IRC connection

function clearJoinTimeout() {
  if (joinTimeout !== null) {
    clearTimeout(joinTimeout);
    joinTimeout = null;
  }
}

function startJoinTimeout() {
  clearJoinTimeout();
  joinTimeout = window.setTimeout(() => {
    // If we connected to IRC but never joined the channel, it probably doesn't exist
    updateStatus('error', "Channel not found");
    showError(`Channel "#${settings.channel}" not found or unavailable. Please check the channel name.`);
    clearJoinTimeout();
  }, JOIN_TIMEOUT);
}

updateStatus('connecting');

client.on("connecting", () => {
  updateStatus('connecting');
  hideError();
  clearJoinTimeout();
});

client.on("connected", () => {
  // Connected to IRC server, but not necessarily joined the channel yet
  console.log(`Connected to Twitch IRC, joining channel: ${settings.channel}`);
  updateStatus('connecting', "Joining channel...");
  startJoinTimeout(); // Start timeout to detect if channel doesn't exist
});

client.on("disconnected", (reason: string) => {
  updateStatus('disconnected');
  clearJoinTimeout();
  console.log(`Disconnected: ${reason}`);

  // Only auto-reconnect if it wasn't a manual disconnect
  if (reason !== "Quit by server" && reason !== "Ping timeout") {
    scheduleReconnect();
  }
});

client.on("reconnect", () => {
  updateStatus('connecting', "Reconnecting...");
  resetReconnectAttempts();
  clearJoinTimeout();
});

client.on("join", (channel: string) => {
  console.log(`Successfully joined channel: ${channel}`);
  clearJoinTimeout();
  updateStatus('connected');
  resetReconnectAttempts();
  hideError();
});

client.on("part", (channel: string) => {
  console.log(`Left channel: ${channel}`);
  clearJoinTimeout();
  updateStatus('disconnected');
});

client.on("notice", (_channel: string, msgid: string, message: string) => {
  console.log(`Notice [${msgid}]: ${message}`);
  clearJoinTimeout();

  // Handle specific notice types
  if (msgid === "msg_channel_suspended" || msgid === "msg_banned") {
    updateStatus('error', "Channel unavailable");
    showError(`Channel "${settings.channel}" is unavailable: ${message}`);
  } else if (msgid === "no_permission") {
    updateStatus('error', "Permission denied");
    showError(`No permission to access channel "${settings.channel}"`);
  } else if (msgid === "msg_channel_not_found" || message.toLowerCase().includes("does not exist")) {
    updateStatus('error', "Channel not found");
    showError(`Channel "#${settings.channel}" not found. Please check the channel name.`);
  }
});

client.on("message", (_channel, state, message) => {
  const username = state["display-name"] || "<unknown>";

  if (settings.exclude.includes(username?.toLowerCase())) {
    return;
  }

  const messageTokens = parseTwitchMessage(message, state.emotes, emotes);
  spawnMessage(username, state.color, messageTokens);
});

// Error handling
client.on("raw_message", () => {
  // Reset reconnect attempts on any activity
  if (reconnectAttempts > 0) {
    resetReconnectAttempts();
  }
});

// Start connection
try {
  client.connect().catch((error) => {
    console.error("Connection error:", error);
    updateStatus('error', "Connection failed");
    showError(`Failed to connect to channel "${settings.channel}". Please check your connection and channel name.`);
    scheduleReconnect();
  });
} catch (error) {
  console.error("Failed to start connection:", error);
  updateStatus('error', "Connection failed");
  showError(`Failed to initialize connection. Please refresh the page.`);
}
