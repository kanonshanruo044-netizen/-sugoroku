import {
  database,
  ref,
  set,
  get,
  update,
  onValue
} from "./firebase.js";

const MAX_PLAYERS = 5;

let roomId = "";
let myPlayerId = "";
let latestRoomData = null;

const homeScreen = document.getElementById("homeScreen");
const roomScreen = document.getElementById("roomScreen");
const gameScreen = document.getElementById("gameScreen");

const playerNameInput = document.getElementById("playerNameInput");
const oshiNameInput = document.getElementById("oshiNameInput");
const roomIdInput = document.getElementById("roomIdInput");

const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const copyRoomButton = document.getElementById("copyRoomButton");
const startGameButton = document.getElementById("startGameButton");

const homeMessage = document.getElementById("homeMessage");
const roomMessage = document.getElementById("roomMessage");
const roomIdText = document.getElementById("roomIdText");
const playerList = document.getElementById("playerList");

createRoomButton.addEventListener("click", createRoom);
joinRoomButton.addEventListener("click", joinRoom);
copyRoomButton.addEventListener("click", copyRoomId);
startGameButton.addEventListener("click", startGameTest);

async function createRoom() {
  const playerName = cleanName(playerNameInput.value);
  const oshiName = cleanName(oshiNameInput.value);

  if (!playerName || !oshiName) {
    homeMessage.textContent = "あなたの名前と推しの名前を入れてください。";
    return;
  }

  roomId = makeRoomId();
  myPlayerId = makePlayerId();

  const roomData = {
    roomId,
    hostId: myPlayerId,
    status: "waiting",
    createdAt: Date.now(),
    players: {
      [myPlayerId]: {
        id: myPlayerId,
        name: playerName,
        oshi: oshiName,
        position: 0,
        joinedAt: Date.now()
      }
    },
    playerOrder: [myPlayerId]
  };

  await set(ref(database, `rooms/${roomId}`), roomData);
  openRoom(roomId);
}

async function joinRoom() {
  const playerName = cleanName(playerNameInput.value);
  const oshiName = cleanName(oshiNameInput.value);
  const inputRoomId = roomIdInput.value.trim().toUpperCase();

  if (!playerName || !oshiName) {
    homeMessage.textContent = "あなたの名前と推しの名前を入れてください。";
    return;
  }

  if (!inputRoomId) {
    homeMessage.textContent = "部屋IDを入れてください。";
    return;
  }

  const roomSnap = await get(ref(database, `rooms/${inputRoomId}`));

  if (!roomSnap.exists()) {
    homeMessage.textContent = "その部屋は見つかりません。";
    return;
  }

  const data = roomSnap.val();
  const order = data.playerOrder || [];

  if (order.length >= MAX_PLAYERS) {
    homeMessage.textContent = "この部屋は満員です。";
    return;
  }

  roomId = inputRoomId;
  myPlayerId = makePlayerId();

  await update(ref(database, `rooms/${roomId}`), {
    [`players/${myPlayerId}`]: {
      id: myPlayerId,
      name: playerName,
      oshi: oshiName,
      position: 0,
      joinedAt: Date.now()
    },
    playerOrder: [...order, myPlayerId]
  });

  openRoom(roomId);
}

function openRoom(id) {
  roomId = id;

  homeScreen.classList.add("hidden");
  roomScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");

  roomIdText.textContent = roomId;

  onValue(ref(database, `rooms/${roomId}`), (snapshot) => {
    if (!snapshot.exists()) {
      roomMessage.textContent = "部屋が見つかりません。";
      return;
    }

    latestRoomData = snapshot.val();
    renderRoom(latestRoomData);
  });
}

function renderRoom(data) {
  const players = data.players || {};
  const order = data.playerOrder || [];

  playerList.innerHTML = "";

  order.forEach((playerId, index) => {
    const player = players[playerId];
    if (!player) return;

    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${player.name} ／ 推し：${player.oshi}`;
    playerList.appendChild(li);
  });

  const isHost = data.hostId === myPlayerId;
  startGameButton.disabled = !isHost;

  roomMessage.textContent = isHost
    ? "部屋作成成功。ゲーム開始は次の段階で動かします。"
    : "部屋参加成功。部屋主を待ってください。";
}

function startGameTest() {
  roomMessage.textContent = "ここまでOK。次にゲーム画面と盤面を入れます。";
}

async function copyRoomId() {
  try {
    await navigator.clipboard.writeText(roomId);
    roomMessage.textContent = "部屋IDをコピーしました。";
  } catch {
    roomMessage.textContent = `部屋IDは ${roomId} です。`;
  }
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, 12);
}

function makeRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";

  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }

  return id;
}

function makePlayerId() {
  return `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}