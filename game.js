import {
  database,
  ref,
  set,
  get,
  update,
  onValue
} from "./firebase.js";

const MAX_PLAYERS = 5;
const GOAL = 24;

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
const rollDiceButton = document.getElementById("rollDiceButton");

const homeMessage = document.getElementById("homeMessage");
const roomMessage = document.getElementById("roomMessage");
const gameMessage = document.getElementById("gameMessage");

const roomIdText = document.getElementById("roomIdText");
const gameRoomIdText = document.getElementById("gameRoomIdText");
const playerList = document.getElementById("playerList");
const board = document.getElementById("board");
const diceResult = document.getElementById("diceResult");
const eventText = document.getElementById("eventText");
const turnPlayerText = document.getElementById("turnPlayerText");

const events = [
  "スタート！{player}は{oshi}の姿を見つけて心臓が跳ねた。",
  "{oshi}と目が合った。1マス進む気力が湧いた。",
  "{oshi}に名前を呼ばれた気がした。今日は勝てる。",
  "{player}は{oshi}の隣を歩いた。足取りが軽い。",
  "尊すぎて一回立ち止まった。深呼吸、大事。",
  "{oshi}が笑った。世界が少し明るくなった。",
  "{player}は差し入れを渡した。反応が気になる。",
  "{oshi}の一言で元気回復。もう少し進めそう。",
  "嫉妬イベント発生。心がざわついた。",
  "{oshi}が近い。近い。近い。近い。",
  "{player}は勇気を出して話しかけた。",
  "{oshi}から小さなお礼をもらった。宝物確定。",
  "照れ隠しで変なことを言った。これはこれで思い出。",
  "{oshi}の横顔を見てしまった。しばらく戻れない。",
  "友達にからかわれた。顔に出ていたらしい。",
  "{oshi}がこちらを気にしている……気がする。",
  "{player}は今日一番の勇気を出した。",
  "{oshi}との距離が少し縮まった。",
  "夢女子パワーで前進。理屈ではない。",
  "{oshi}の言葉が胸に残った。",
  "{player}は小さな約束をした。",
  "空気が甘い。これはイベントの匂い。",
  "{oshi}が手を差し出した。進むしかない。",
  "あと少し。{player}の心臓は大忙し。",
  "ゴール！{player}と{oshi}の物語はまだ続く。"
];

createBoard();

createRoomButton.addEventListener("click", createRoom);
joinRoomButton.addEventListener("click", joinRoom);
copyRoomButton.addEventListener("click", copyRoomId);
startGameButton.addEventListener("click", startGame);
rollDiceButton.addEventListener("click", rollDice);

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
    turnIndex: 0,
    lastDice: null,
    lastEvent: "部屋を作りました。友達を呼んでください。",
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

  const snap = await get(ref(database, `rooms/${inputRoomId}`));

  if (!snap.exists()) {
    homeMessage.textContent = "その部屋は見つかりません。";
    return;
  }

  const data = snap.val();
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
  gameRoomIdText.textContent = roomId;

  onValue(ref(database, `rooms/${roomId}`), (snapshot) => {
    if (!snapshot.exists()) {
      roomMessage.textContent = "部屋が見つかりません。";
      return;
    }

    latestRoomData = snapshot.val();

    if (latestRoomData.status === "playing") {
      renderGame(latestRoomData);
    } else {
      renderRoom(latestRoomData);
    }
  });
}

function renderRoom(data) {
  homeScreen.classList.add("hidden");
  roomScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");

  const players = data.players || {};
  const order = data.playerOrder || [];

  playerList.innerHTML = "";

  order.forEach((id, index) => {
    const player = players[id];
    if (!player) return;

    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${player.name} ／ 推し：${player.oshi}`;
    playerList.appendChild(li);
  });

  const isHost = data.hostId === myPlayerId;
  startGameButton.disabled = !isHost;

  roomMessage.textContent = isHost
    ? "準備できたらゲーム開始を押してください。"
    : "部屋主がゲームを開始するまで待ってください。";
}

async function startGame() {
  if (!latestRoomData) return;

  if (latestRoomData.hostId !== myPlayerId) {
    roomMessage.textContent = "ゲーム開始は部屋主だけができます。";
    return;
  }

  await update(ref(database, `rooms/${roomId}`), {
    status: "playing",
    turnIndex: 0,
    lastDice: null,
    lastEvent: "ゲーム開始！最初の人からサイコロを振ってください。"
  });
}

function renderGame(data) {
  homeScreen.classList.add("hidden");
  roomScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  const players = data.players || {};
  const order = data.playerOrder || [];
  const turnIndex = data.turnIndex || 0;
  const currentPlayerId = order[turnIndex];
  const currentPlayer = players[currentPlayerId];

  turnPlayerText.textContent = currentPlayer ? currentPlayer.name : "---";
  diceResult.textContent = data.lastDice ? `🎲 ${data.lastDice}` : "🎲";
  eventText.textContent = data.lastEvent || "ゲーム開始！";

  rollDiceButton.disabled = currentPlayerId !== myPlayerId;

  gameMessage.textContent =
    currentPlayerId === myPlayerId
      ? "あなたの番です。サイコロを振ってください。"
      : "友達の番です。見守りましょう。";

  renderPieces(data);
}

async function rollDice() {
  if (!latestRoomData) return;

  const data = latestRoomData;
  const players = data.players || {};
  const order = data.playerOrder || [];
  const turnIndex = data.turnIndex || 0;
  const currentPlayerId = order[turnIndex];

  if (currentPlayerId !== myPlayerId) {
    gameMessage.textContent = "まだあなたの番ではありません。";
    return;
  }

  const player = players[myPlayerId];
  if (!player) return;

  rollDiceButton.disabled = true;

  const dice = Math.floor(Math.random() * 6) + 1;
  const oldPosition = player.position || 0;
  const newPosition = Math.min(oldPosition + dice, GOAL);

  const nextTurnIndex = (turnIndex + 1) % order.length;
  const event = makeEventText(newPosition, player);

  const updates = {
    [`players/${myPlayerId}/position`]: newPosition,
    lastDice: dice,
    lastEvent: `${player.name}が${dice}を出した！ ${event}`
  };

  if (newPosition >= GOAL) {
    updates.status = "finished";
    updates.lastEvent = `🎉 ${player.name}がゴール！ ${player.oshi}との物語はまだ続く。`;
  } else {
    updates.turnIndex = nextTurnIndex;
  }

  await update(ref(database, `rooms/${roomId}`), updates);
}

function createBoard() {
  board.innerHTML = "";

  for (let i = 0; i <= GOAL; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";

    if (i === GOAL) {
      cell.classList.add("goal");
    }

    const number = document.createElement("div");
    number.className = "cellNumber";
    number.textContent = i === 0 ? "START" : i === GOAL ? "GOAL" : i;

    const pieces = document.createElement("div");
    pieces.className = "pieces";
    pieces.id = `pieces-${i}`;

    cell.appendChild(number);
    cell.appendChild(pieces);
    board.appendChild(cell);
  }
}

function renderPieces(data) {
  for (let i = 0; i <= GOAL; i++) {
    const box = document.getElementById(`pieces-${i}`);
    if (box) box.innerHTML = "";
  }

  const players = data.players || {};
  const order = data.playerOrder || [];

  order.forEach((id, index) => {
    const player = players[id];
    if (!player) return;

    const pos = player.position || 0;
    const box = document.getElementById(`pieces-${pos}`);
    if (!box) return;

    const piece = document.createElement("div");
    piece.className = `piece piece${index}`;
    piece.textContent = player.name.slice(0, 1);

    box.appendChild(piece);
  });
}

async function copyRoomId() {
  try {
    await navigator.clipboard.writeText(roomId);
    roomMessage.textContent = "部屋IDをコピーしました。";
  } catch {
    roomMessage.textContent = `部屋IDは ${roomId} です。`;
  }
}

function makeEventText(position, player) {
  const text = events[position] || events[0];

  return text
    .replaceAll("{player}", player.name)
    .replaceAll("{oshi}", player.oshi);
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
}、わ
