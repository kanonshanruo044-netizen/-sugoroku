import {
  database,
  ref,
  set,
  get,
  update,
  onValue,
  off,
  runTransaction
} from "./firebase.js";

/* =========================================================
   夢女子すごろく ONLINE
   - Firebase Realtime Database 版
   - 最大5人 / 部屋ID / 順番制 / 同時操作対策
   ========================================================= */

const MAX_PLAYERS = 5;
const GOAL = 24;
const ROOM_ID_LENGTH = 6;
const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLAYER_ID_KEY = "yumeSugorokuPlayerId";
const ROOM_ID_KEY = "yumeSugorokuRoomId";

const COURSE = {
  id: "default",
  name: "はじまりのときめきコース",
  events: [
    "スタート！{player}は{oshi}の姿を見つけて、心臓が跳ねた。",
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
    "ゴール！{player}と{oshi}の物語は、まだ続く。"
  ]
};

const state = {
  roomId: "",
  playerId: "",
  room: null,
  unsubscribeRoom: null,
  isRolling: false
};

const $ = (id) => document.getElementById(id);

const ui = {
  homeScreen: $("homeScreen"),
  roomScreen: $("roomScreen"),
  gameScreen: $("gameScreen"),

  playerNameInput: $("playerNameInput"),
  oshiNameInput: $("oshiNameInput"),
  roomIdInput: $("roomIdInput"),

  createRoomButton: $("createRoomButton"),
  joinRoomButton: $("joinRoomButton"),
  copyRoomButton: $("copyRoomButton"),
  leaveRoomButton: $("leaveRoomButton"),
  startGameButton: $("startGameButton"),
  rollDiceButton: $("rollDiceButton"),
  replayButton: $("replayButton"),

  homeMessage: $("homeMessage"),
  roomMessage: $("roomMessage"),
  gameMessage: $("gameMessage"),

  roomIdText: $("roomIdText"),
  gameRoomIdText: $("gameRoomIdText"),
  playerList: $("playerList"),
  board: $("board"),
  diceResult: $("diceResult"),
  eventText: $("eventText"),
  turnPlayerText: $("turnPlayerText"),
  courseNameText: $("courseNameText"),
  resultPanel: $("resultPanel"),
  resultText: $("resultText")
};

init();

function init() {
  createBoard();
  bindEvents();
  restoreLastRoom();
}

function bindEvents() {
  ui.createRoomButton.addEventListener("click", createRoom);
  ui.joinRoomButton.addEventListener("click", joinRoom);
  ui.copyRoomButton.addEventListener("click", copyRoomId);
  ui.leaveRoomButton.addEventListener("click", leaveRoom);
  ui.startGameButton.addEventListener("click", startGame);
  ui.rollDiceButton.addEventListener("click", rollDice);
  ui.replayButton.addEventListener("click", replayGame);

  ui.roomIdInput.addEventListener("input", () => {
    ui.roomIdInput.value = normaliseRoomId(ui.roomIdInput.value);
  });

  [ui.playerNameInput, ui.oshiNameInput, ui.roomIdInput].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        if (ui.roomIdInput.value.trim()) joinRoom();
        else createRoom();
      }
    });
  });
}

async function restoreLastRoom() {
  const savedRoomId = sessionStorage.getItem(ROOM_ID_KEY);
  const savedPlayerId = sessionStorage.getItem(PLAYER_ID_KEY);

  if (!savedRoomId || !savedPlayerId) return;

  const roomSnapshot = await get(ref(database, `rooms/${savedRoomId}`));
  const savedRoom = roomSnapshot.val();

  if (!savedRoom || !savedRoom.players?.[savedPlayerId]) {
    clearSavedSession();
    return;
  }

  state.roomId = savedRoomId;
  state.playerId = savedPlayerId;
  openRoom(savedRoomId);
}

async function createRoom() {
  const player = readPlayerInputs();
  if (!player) return;

  setHomeMessage("部屋を作成中です…");
  setButtonLoading(ui.createRoomButton, true, "作成中…");

  try {
    const playerId = makePlayerId();
    let createdRoomId = "";

    for (let i = 0; i < 8; i += 1) {
      const candidate = makeRoomId();
      const result = await runTransaction(ref(database, `rooms/${candidate}`), (current) => {
        if (current !== null) return;

        return makeNewRoom(candidate, playerId, player);
      });

      if (result.committed) {
        createdRoomId = candidate;
        break;
      }
    }

    if (!createdRoomId) {
      throw new Error("部屋IDの作成に失敗しました。もう一度試してください。");
    }

    state.roomId = createdRoomId;
    state.playerId = playerId;
    saveSession();
    openRoom(createdRoomId);
  } catch (error) {
    console.error("createRoom error", error);
    setHomeMessage(toFriendlyError(error));
  } finally {
    setButtonLoading(ui.createRoomButton, false);
  }
}

async function joinRoom() {
  const player = readPlayerInputs();
  if (!player) return;

  const targetRoomId = normaliseRoomId(ui.roomIdInput.value);
  if (!targetRoomId) {
    setHomeMessage("部屋IDを入れてください。", true);
    return;
  }

  setHomeMessage("部屋に参加中です…");
  setButtonLoading(ui.joinRoomButton, true, "参加中…");

  try {
    const playerId = makePlayerId();
    let reason = "";

    const result = await runTransaction(ref(database, `rooms/${targetRoomId}`), (room) => {
      if (!room) {
        reason = "notFound";
        return;
      }

      if (room.status !== "waiting") {
        reason = "alreadyStarted";
        return;
      }

      const order = Array.isArray(room.playerOrder) ? room.playerOrder : [];
      if (order.length >= MAX_PLAYERS) {
        reason = "full";
        return;
      }

      room.players = room.players || {};
      room.players[playerId] = {
        id: playerId,
        name: player.name,
        oshi: player.oshi,
        position: 0,
        joinedAt: Date.now()
      };
      room.playerOrder = [...order, playerId];
      room.updatedAt = Date.now();
      room.lastEvent = `${player.name}が部屋に参加しました！`;
      return room;
    });

    if (!result.committed) {
      if (reason === "notFound") throw new Error("その部屋は見つかりません。");
      if (reason === "alreadyStarted") throw new Error("この部屋はすでにゲームを開始しています。");
      if (reason === "full") throw new Error("この部屋は満員です（最大5人）。");
      throw new Error("部屋に参加できませんでした。もう一度試してください。");
    }

    state.roomId = targetRoomId;
    state.playerId = playerId;
    saveSession();
    openRoom(targetRoomId);
  } catch (error) {
    console.error("joinRoom error", error);
    setHomeMessage(toFriendlyError(error));
  } finally {
    setButtonLoading(ui.joinRoomButton, false);
  }
}

function openRoom(roomId) {
  if (state.unsubscribeRoom) {
    off(ref(database, `rooms/${state.roomId}`));
  }

  state.roomId = roomId;
  ui.roomIdText.textContent = roomId;
  ui.gameRoomIdText.textContent = roomId;

  const roomRef = ref(database, `rooms/${roomId}`);
  state.unsubscribeRoom = onValue(
    roomRef,
    (snapshot) => {
      const room = snapshot.val();

      if (!room) {
        setRoomMessage("この部屋はなくなりました。", true);
        leaveRoom(false);
        return;
      }

      state.room = room;
      renderRoomState(room);
    },
    (error) => {
      console.error("room listener error", error);
      setRoomMessage(toFriendlyError(error), true);
    }
  );
}

function renderRoomState(room) {
  const status = room.status || "waiting";

  if (status === "waiting") {
    showScreen("room");
    renderLobby(room);
    return;
  }

  showScreen("game");
  renderGame(room);
}

function renderLobby(room) {
  const players = getOrderedPlayers(room);
  const isHost = room.hostId === state.playerId;

  ui.playerList.innerHTML = "";

  players.forEach((player, index) => {
    const li = document.createElement("li");
    li.className = "playerItem";

    const name = document.createElement("strong");
    name.textContent = `${index + 1}. ${player.name}${player.id === room.hostId ? "（部屋主）" : ""}`;

    const oshi = document.createElement("span");
    oshi.textContent = `推し：${player.oshi}`;

    li.append(name, oshi);
    ui.playerList.appendChild(li);
  });

  ui.startGameButton.disabled = !isHost || players.length === 0;
  ui.startGameButton.textContent = isHost ? "ゲーム開始" : "部屋主の開始を待つ";

  setRoomMessage(
    isHost
      ? `参加者 ${players.length} / ${MAX_PLAYERS}人。準備できたら開始してください。`
      : `参加者 ${players.length} / ${MAX_PLAYERS}人。部屋主が開始するまで待ってください。`
  );
}

async function startGame() {
  if (!state.room || state.room.hostId !== state.playerId) {
    setRoomMessage("ゲームを開始できるのは部屋主だけです。", true);
    return;
  }

  setButtonLoading(ui.startGameButton, true, "開始中…");

  try {
    const result = await runTransaction(ref(database, `rooms/${state.roomId}`), (room) => {
      if (!room || room.hostId !== state.playerId || room.status !== "waiting") return;

      const playerOrder = Array.isArray(room.playerOrder) ? room.playerOrder : [];
      if (playerOrder.length === 0) return;

      room.status = "playing";
      room.turnIndex = 0;
      room.lastDice = null;
      room.winnerId = null;
      room.lastEvent = "ゲーム開始！ 最初の人からサイコロを振ってください。";
      room.updatedAt = Date.now();
      return room;
    });

    if (!result.committed) {
      throw new Error("ゲームを開始できませんでした。画面を更新して確認してください。");
    }
  } catch (error) {
    console.error("startGame error", error);
    setRoomMessage(toFriendlyError(error), true);
  } finally {
    setButtonLoading(ui.startGameButton, false);
  }
}

function renderGame(room) {
  const players = getOrderedPlayers(room);
  const turnIndex = normaliseTurnIndex(room.turnIndex, players.length);
  const currentPlayer = players[turnIndex];
  const isMyTurn = room.status === "playing" && currentPlayer?.id === state.playerId;
  const winner = room.winnerId ? room.players?.[room.winnerId] : null;

  ui.turnPlayerText.textContent = currentPlayer?.name || "---";
  ui.courseNameText.textContent = room.courseName || COURSE.name;
  ui.diceResult.textContent = room.lastDice ? diceFace(room.lastDice) : "🎲";
  ui.eventText.textContent = room.lastEvent || "ゲーム開始！";

  ui.rollDiceButton.disabled = !isMyTurn || state.isRolling;
  ui.rollDiceButton.textContent = state.isRolling ? "サイコロを振っています…" : "サイコロを振る";

  if (room.status === "finished" && winner) {
    ui.resultPanel.classList.remove("hidden");
    ui.resultText.textContent = `🎉 ${winner.name}がゴール！ 推しの${winner.oshi}との物語は、まだ続く。`;
    ui.replayButton.classList.toggle("hidden", room.hostId !== state.playerId);
    setGameMessage(room.hostId === state.playerId ? "再戦を始められます。" : "部屋主が再戦を始めるまで待ってください。");
  } else {
    ui.resultPanel.classList.add("hidden");
    setGameMessage(isMyTurn ? "あなたの番です。サイコロを振ってください。" : `${currentPlayer?.name || "誰か"}の番です。`);
  }

  renderPieces(room);
}

async function rollDice() {
  if (state.isRolling || !state.room) return;

  const players = getOrderedPlayers(state.room);
  const currentPlayer = players[normaliseTurnIndex(state.room.turnIndex, players.length)];

  if (state.room.status !== "playing" || currentPlayer?.id !== state.playerId) {
    setGameMessage("まだあなたの番ではありません。", true);
    return;
  }

  state.isRolling = true;
  ui.rollDiceButton.disabled = true;
  ui.diceResult.classList.add("rolling");
  playDiceSound();

  try {
    const rolledDice = await animateDice();
    let failureMessage = "";

    const result = await runTransaction(ref(database, `rooms/${state.roomId}`), (room) => {
      if (!room || room.status !== "playing") {
        failureMessage = "ゲームはすでに終了しています。";
        return;
      }

      const order = Array.isArray(room.playerOrder) ? room.playerOrder : [];
      const turnIndex = normaliseTurnIndex(room.turnIndex, order.length);
      const currentPlayerId = order[turnIndex];

      if (currentPlayerId !== state.playerId) {
        failureMessage = "ほかの人の番になっています。";
        return;
      }

      const player = room.players?.[state.playerId];
      if (!player) {
        failureMessage = "プレイヤー情報が見つかりません。";
        return;
      }

      const oldPosition = Number(player.position) || 0;
      const newPosition = Math.min(oldPosition + rolledDice, GOAL);
      const event = makeEventText(newPosition, player);

      player.position = newPosition;
      room.lastDice = rolledDice;
      room.lastEvent = `${player.name}が${rolledDice}を出した！ ${event}`;
      room.updatedAt = Date.now();

      if (newPosition >= GOAL) {
        room.status = "finished";
        room.winnerId = state.playerId;
        room.lastEvent = `🎉 ${player.name}がゴール！ 推しの${player.oshi}との物語は、まだ続く。`;
      } else {
        room.turnIndex = (turnIndex + 1) % order.length;
      }

      return room;
    });

    if (!result.committed) {
      throw new Error(failureMessage || "サイコロの結果を反映できませんでした。");
    }
  } catch (error) {
    console.error("rollDice error", error);
    setGameMessage(toFriendlyError(error), true);
  } finally {
    state.isRolling = false;
    ui.diceResult.classList.remove("rolling");
    if (state.room) renderGame(state.room);
  }
}

async function replayGame() {
  if (!state.room || state.room.hostId !== state.playerId) return;

  try {
    const result = await runTransaction(ref(database, `rooms/${state.roomId}`), (room) => {
      if (!room || room.hostId !== state.playerId || room.status !== "finished") return;

      const order = Array.isArray(room.playerOrder) ? room.playerOrder : [];
      order.forEach((id) => {
        if (room.players?.[id]) room.players[id].position = 0;
      });

      room.status = "playing";
      room.turnIndex = 0;
      room.lastDice = null;
      room.winnerId = null;
      room.lastEvent = "再戦スタート！ 最初の人からサイコロを振ってください。";
      room.updatedAt = Date.now();
      return room;
    });

    if (!result.committed) throw new Error("再戦を開始できませんでした。");
  } catch (error) {
    console.error("replayGame error", error);
    setGameMessage(toFriendlyError(error), true);
  }
}

async function copyRoomId() {
  if (!state.roomId) return;

  try {
    await navigator.clipboard.writeText(state.roomId);
    setRoomMessage("部屋IDをコピーしました。友達に送ってください。", false);
  } catch {
    setRoomMessage(`部屋ID：${state.roomId}`, false);
  }
}

async function leaveRoom(removePlayer = true) {
  const leavingRoomId = state.roomId;
  const leavingPlayerId = state.playerId;

  if (state.unsubscribeRoom && leavingRoomId) {
    off(ref(database, `rooms/${leavingRoomId}`));
  }

  state.roomId = "";
  state.playerId = "";
  state.room = null;
  state.unsubscribeRoom = null;
  clearSavedSession();
  showScreen("home");

  if (!removePlayer || !leavingRoomId || !leavingPlayerId) return;

  try {
    await runTransaction(ref(database, `rooms/${leavingRoomId}`), (room) => {
      if (!room || room.status !== "waiting" || !room.players?.[leavingPlayerId]) return room;

      const order = (room.playerOrder || []).filter((id) => id !== leavingPlayerId);
      delete room.players[leavingPlayerId];
      room.playerOrder = order;
      room.updatedAt = Date.now();

      if (room.hostId === leavingPlayerId && order.length > 0) {
        room.hostId = order[0];
        room.lastEvent = "部屋主が退出したため、部屋主が引き継がれました。";
      }

      if (order.length === 0) return null;
      return room;
    });
  } catch (error) {
    console.warn("leaveRoom cleanup error", error);
  }
}

function createBoard() {
  ui.board.innerHTML = "";

  for (let position = 0; position <= GOAL; position += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.position = String(position);

    if (position === 0) cell.classList.add("start");
    if (position === GOAL) cell.classList.add("goal");

    const number = document.createElement("span");
    number.className = "cellNumber";
    number.textContent = position === 0 ? "START" : position === GOAL ? "GOAL" : String(position);

    const pieces = document.createElement("div");
    pieces.className = "pieces";
    pieces.id = `pieces-${position}`;

    cell.append(number, pieces);
    ui.board.appendChild(cell);
  }
}

function renderPieces(room) {
  for (let position = 0; position <= GOAL; position += 1) {
    const box = $("pieces-" + position);
    if (box) box.innerHTML = "";
  }

  getOrderedPlayers(room).forEach((player, index) => {
    const position = Math.max(0, Math.min(Number(player.position) || 0, GOAL));
    const box = $("pieces-" + position);
    if (!box) return;

    const piece = document.createElement("span");
    piece.className = `piece piece${index}`;
    piece.title = `${player.name} ／ 推し：${player.oshi}`;
    piece.setAttribute("aria-label", `${player.name}のコマ`);
    piece.textContent = player.name.slice(0, 1);

    if (player.id === state.playerId) piece.classList.add("me");
    box.appendChild(piece);
  });
}

function makeNewRoom(roomId, playerId, player) {
  return {
    roomId,
    hostId: playerId,
    status: "waiting",
    courseId: COURSE.id,
    courseName: COURSE.name,
    turnIndex: 0,
    lastDice: null,
    lastEvent: "部屋を作りました。友達を呼んでください。",
    winnerId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: {
      [playerId]: {
        id: playerId,
        name: player.name,
        oshi: player.oshi,
        position: 0,
        joinedAt: Date.now()
      }
    },
    playerOrder: [playerId]
  };
}

function readPlayerInputs() {
  const name = cleanName(ui.playerNameInput.value);
  const oshi = cleanName(ui.oshiNameInput.value);

  if (!name || !oshi) {
    setHomeMessage("あなたの名前と推しの名前を入れてください。", true);
    return null;
  }

  return { name, oshi };
}

function getOrderedPlayers(room) {
  const players = room.players || {};
  const order = Array.isArray(room.playerOrder) ? room.playerOrder : [];
  return order.map((id) => players[id]).filter(Boolean);
}

function normaliseTurnIndex(value, count) {
  if (!count) return 0;
  const index = Number(value) || 0;
  return ((index % count) + count) % count;
}

function makeEventText(position, player) {
  return (COURSE.events[position] || COURSE.events[0])
    .replaceAll("{player}", player.name)
    .replaceAll("{oshi}", player.oshi);
}

function diceFace(value) {
  return ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value - 1] || "🎲";
}

async function animateDice() {
  const duration = 700;
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      const preview = Math.floor(Math.random() * 6) + 1;
      ui.diceResult.textContent = diceFace(preview);

      if (performance.now() - startedAt >= duration) {
        window.clearInterval(timer);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        ui.diceResult.textContent = diceFace(finalValue);
        resolve(finalValue);
      }
    }, 90);
  });
}

function playDiceSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(180, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(90, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.addEventListener("ended", () => context.close());
  } catch {
    // 音が出せない端末でもゲーム自体は続ける。
  }
}

function showScreen(name) {
  ui.homeScreen.classList.toggle("hidden", name !== "home");
  ui.roomScreen.classList.toggle("hidden", name !== "room");
  ui.gameScreen.classList.toggle("hidden", name !== "game");
}

function setHomeMessage(text, isError = false) {
  setMessage(ui.homeMessage, text, isError);
}

function setRoomMessage(text, isError = false) {
  setMessage(ui.roomMessage, text, isError);
}

function setGameMessage(text, isError = false) {
  setMessage(ui.gameMessage, text, isError);
}

function setMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle("isError", Boolean(isError));
}

function setButtonLoading(button, isLoading, loadingText = "") {
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = loadingText || button.textContent;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

function cleanName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.#$\[\]/]/g, "")
    .slice(0, 12);
}

function normaliseRoomId(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_ID_LENGTH);
}

function makeRoomId() {
  let id = "";
  for (let i = 0; i < ROOM_ID_LENGTH; i += 1) {
    id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return id;
}

function makePlayerId() {
  return `player_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function saveSession() {
  sessionStorage.setItem(ROOM_ID_KEY, state.roomId);
  sessionStorage.setItem(PLAYER_ID_KEY, state.playerId);
}

function clearSavedSession() {
  sessionStorage.removeItem(ROOM_ID_KEY);
  sessionStorage.removeItem(PLAYER_ID_KEY);
}

function toFriendlyError(error) {
  const message = error?.message || "不明なエラーが発生しました。";

  if (message.includes("PERMISSION_DENIED")) {
    return "Firebaseのルールで拒否されました。Realtime Databaseのルールを確認してください。";
  }

  if (message.includes("network") || message.includes("Network")) {
    return "通信に失敗しました。電波のよい場所で、もう一度試してください。";
  }

  return message;
}
