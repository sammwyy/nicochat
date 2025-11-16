
import tmi from "tmi.js";

import { EmoteFetcher } from './emote';
import { parseTwitchMessage, type MessageToken } from "./parser";
import { settings } from "./settings";

import './styles/fonts.css'
import './styles/app.css'

// DOM
const container = document.querySelector<HTMLDivElement>('#app')!;
const messageHistory: HTMLDivElement[] = [];

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

// Emotes
const emotes = new EmoteFetcher();
emotes.fetchEmotes(settings.channel);

// Chat
const client = new tmi.Client({
  channels: [settings.channel],
});

client.connect();

client.on("connected", () => {
  console.log("Connected");
})

client.on("message", (_channel, state, message) => {
  const username = state["display-name"] || "<unknown>";

  if (settings.exclude.includes(username?.toLowerCase())) {
    return;
  }

  const messageTokens = parseTwitchMessage(message, state.emotes, emotes);
  spawnMessage(username, state.color, messageTokens);
})
