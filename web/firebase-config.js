import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCdiwargiL5Rh4p5OAIojssI45W5xeKgPc",
    authDomain: "leetrack-38425.firebaseapp.com",
    projectId: "leetrack-38425",
    storageBucket: "leetrack-38425.firebasestorage.app",
    messagingSenderId: "874400551274",
    appId: "1:874400551274:web:fef6e6712546b9f69dd513",
    measurementId: "G-63HYYE53HE"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);