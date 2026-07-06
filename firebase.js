// firebase.js
// 夢女子すごろく ONLINE 用 Firebase設定ファイル

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  off,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBCXd5-qmoY-8Ql_7Ngvt1Yx3uBGgg82AI",
  authDomain: "yume-sugoroku.firebaseapp.com",
  databaseURL: "https://yume-sugoroku-default-rtdb.firebaseio.com",
  projectId: "yume-sugoroku",
  storageBucket: "yume-sugoroku.firebasestorage.app",
  messagingSenderId: "165439055406",
  appId: "1:165439055406:web:83e9e7e12621130059e1bf"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export {
  database,
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  off,
 runTransaction
};
