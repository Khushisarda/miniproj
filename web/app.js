import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const API_BASE = "http://localhost:8000";

let currentUserUid = null;
let userData = { my_leetcode_id: null, friends: [] };
let allLeetcodeData = []; 

window.linkMyProfile = async function() {
    const input = document.getElementById('myLeetcodeInput').value.trim();
    if (!input) return;
    
    showToast("Linking profile...", "success");
    try {
        await fetch(`${API_BASE}?username=${encodeURIComponent(input)}`);
        const userRef = doc(db, "users", currentUserUid);
        await updateDoc(userRef, { my_leetcode_id: input });
        
        userData.my_leetcode_id = input;
        showToast("Profile linked successfully!", "success");
        await loadData();
    } catch (e) {
        showToast("Failed to link profile", "error");
    }
};

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace('login.html');
    } else {
        currentUserUid = user.uid;
        document.querySelector('.app').style.display = 'grid';
        await loadData();
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).catch(e => console.error(e));
});

async function loadData() {
    try {
        const userRef = doc(db, "users", currentUserUid);
        const docSnap = await getDoc(userRef);
        
        if (docSnap.exists()) {
            userData = docSnap.data();
        } else {
            await setDoc(userRef, { my_leetcode_id: null, friends: [] });
            userData = { my_leetcode_id: null, friends: [] };
        }

        const r = await fetch(`${API_BASE}?source=list`);
        const d = await r.json();
        
        if (d.status === 'success') {
            allLeetcodeData = d.users || [];
            renderAll();
        } else {
            showError('Failed to load data from server.');
        }
    } catch (e) {
        showError('Cannot connect to backend API.');
    }
}

function renderAll() {
    renderProfile();
    renderFriends();
    renderFriendsLeaderboard();
    renderGlobalLeaderboard();
}

function renderProfile() {
    const el = document.getElementById('profileContent');

    if (!userData.my_leetcode_id) {
        el.innerHTML = `
            <div class="empty">
                <div class="empty-icon">👤</div>
                <h3>Link Your Profile</h3>
                <p>Enter your personal LeetCode username to view your stats here.</p>
                <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: center; max-width: 300px; margin-inline: auto;">
                    <input type="text" id="myLeetcodeInput" placeholder="Your username" style="padding: 0.75rem; border-radius: var(--r2); border: 1px solid var(--border2); background: var(--bg3); color: var(--text); width: 100%;">
                    <button onclick="linkMyProfile()" style="padding: 0.75rem 1.5rem; background: var(--accent); color: var(--bg); border: none; border-radius: var(--r2); font-weight: bold; cursor: pointer;">Link</button>
                </div>
            </div>`;
        return;
    }

    const myProfile = allLeetcodeData.find(u => u.username === userData.my_leetcode_id);
    if (!myProfile) {
        el.innerHTML = `<div class="empty"><p>Profile data not found. It may take a moment to sync.</p></div>`;
        return;
    }

    const t = getTotals(myProfile);
    const sub = myProfile.last_submission;
    const easyPct = t.total ? Math.round((t.easy / t.total) * 100) : 0;
    const medPct = t.total ? Math.round((t.medium / t.total) * 100) : 0;
    const hardPct = t.total ? Math.round((t.hard / t.total) * 100) : 0;

    el.innerHTML = `
    <div class="profile-hero">
        <div class="profile-hero-top">
            <div class="profile-big-avatar">${getInitial(myProfile)}</div>
            <div class="profile-hero-info">
                <div class="profile-hero-name">${myProfile.name || myProfile.username}</div>
                <div class="profile-hero-handle">@${myProfile.username}</div>
                <div class="profile-hero-updated">Last updated ${formatRelative(myProfile.last_updated)}</div>
            </div>
        </div>
        <div class="profile-stats-grid">
            <div class="pstat"><span class="pstat-val">${t.total}</span><div class="pstat-label">Total</div></div>
            <div class="pstat"><span class="pstat-val easy">${t.easy}</span><div class="pstat-label">Easy</div></div>
            <div class="pstat"><span class="pstat-val medium">${t.medium}</span><div class="pstat-label">Medium</div></div>
            <div class="pstat"><span class="pstat-val hard">${t.hard}</span><div class="pstat-label">Hard</div></div>
        </div>
    </div>
    <div class="profile-progress">
        <div class="progress-title">Problem Breakdown</div>
        <div class="prog-row">
            <div class="prog-header"><span class="prog-name" style="color:var(--easy)">Easy</span><span class="prog-count">${t.easy} · ${easyPct}%</span></div>
            <div class="prog-track"><div class="prog-fill easy" style="width:${easyPct}%"></div></div>
        </div>
        <div class="prog-row">
            <div class="prog-header"><span class="prog-name" style="color:var(--medium)">Medium</span><span class="prog-count">${t.medium} · ${medPct}%</span></div>
            <div class="prog-track"><div class="prog-fill medium" style="width:${medPct}%"></div></div>
        </div>
        <div class="prog-row">
            <div class="prog-header"><span class="prog-name" style="color:var(--hard)">Hard</span><span class="prog-count">${t.hard} · ${hardPct}%</span></div>
            <div class="prog-track"><div class="prog-fill hard" style="width:${hardPct}%"></div></div>
        </div>
    </div>
    ${sub ? `
    <div class="last-sub-card">
        <div class="last-sub-header">Last Submission</div>
        <div class="last-sub-content">
            <a class="last-sub-title" href="${sub.url}" target="_blank">${sub.title}</a>
            <div class="last-sub-meta">
                <span class="lang-chip">${sub.lang}</span>
                <span class="time-chip">${formatRelative(sub.timestamp)}</span>
            </div>
        </div>
    </div>` : ''}`;
}

function renderFriends() {
    const grid = document.getElementById('friendsGrid');
    const myFriends = allLeetcodeData.filter(u => userData.friends.includes(u.username));

    if (myFriends.length === 0) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">👥</div><h3>No friends added</h3><p>Click "Add Friend" to start tracking.</p></div>`;
        return;
    }

    grid.innerHTML = myFriends.map(user => {
        const t = getTotals(user);
        const sub = user.last_submission;
        return `
        <div class="friend-card">
            <div class="friend-card-top">
                <div class="friend-avatar">${getInitial(user)}</div>
                <div class="friend-meta">
                    <div class="friend-name">${user.name || user.username}</div>
                    <div class="friend-handle">@${user.username}</div>
                </div>
            </div>
            <div class="friend-stats">
                <div class="fstat"><span class="fstat-val easy">${t.easy}</span><div class="fstat-label">Easy</div></div>
                <div class="fstat"><span class="fstat-val medium">${t.medium}</span><div class="fstat-label">Medium</div></div>
                <div class="fstat"><span class="fstat-val hard">${t.hard}</span><div class="fstat-label">Hard</div></div>
            </div>
            <div class="friend-card-bottom">
                <div class="last-problem" style="color:var(--text3)">${sub ? sub.title : 'No submissions yet'}</div>
                <div class="total-chip">${t.total} solved</div>
            </div>
        </div>`;
    }).join('');
}

// Reusable function to build the leaderboard UI
function renderGenericLeaderboard(dataArray, podiumId, listId, emptyMsg) {
    const podiumEl = document.getElementById(podiumId);
    const listEl = document.getElementById(listId);

    if (dataArray.length === 0) {
        podiumEl.innerHTML = '';
        listEl.innerHTML = `<div class="empty"><div class="empty-icon">🏆</div><h3>Leaderboard empty</h3><p>${emptyMsg}</p></div>`;
        return;
    }

    const maxTotal = getTotals(dataArray[0]).total || 1;
    const rankEmojis = ['🥇', '🥈', '🥉'];
    const rankClasses = ['rank-1', 'rank-2', 'rank-3'];

    const top3 = dataArray.slice(0, Math.min(3, dataArray.length));
    const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]];
    const originalIdx = podiumOrder.map(u => top3.indexOf(u));

    podiumEl.innerHTML = podiumOrder.map((user, pi) => {
        const ri = originalIdx[pi]; 
        const t = getTotals(user);
        return `
        <div class="podium-card ${rankClasses[ri]}">
            <div class="podium-rank">${rankEmojis[ri]}</div>
            <div class="podium-avatar">${getInitial(user)}</div>
            <div class="podium-name">${user.name || user.username}</div>
            <div class="podium-handle">@${user.username}</div>
            <div class="podium-total">${t.total}</div>
        </div>`;
    }).join('');

    const rest = dataArray.slice(3);
    if (rest.length === 0) { listEl.innerHTML = ''; return; }

    listEl.innerHTML = rest.map((user, i) => {
        const t = getTotals(user);
        const pct = Math.round((t.total / maxTotal) * 100);
        return `
        <div class="rank-row">
            <div class="rank-num">#${i + 4}</div>
            <div class="rank-row-info">
                <div class="rank-avatar-sm">${getInitial(user)}</div>
                <div>
                    <div class="rank-row-name">${user.name || user.username}</div>
                    <div class="rank-row-handle">@${user.username}</div>
                    <div class="bar-wrap" style="width:160px;max-width:100%"><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>
                </div>
            </div>
            <div class="rank-row-right">
                <div class="rank-total">${t.total}</div>
                <div class="rank-breakdown">
                    <span class="diff-badge easy">${t.easy}E</span>
                    <span class="diff-badge medium">${t.medium}M</span>
                    <span class="diff-badge hard">${t.hard}H</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Render the Private Friends Leaderboard
function renderFriendsLeaderboard() {
    let networkUsernames = [...userData.friends];
    if (userData.my_leetcode_id) networkUsernames.push(userData.my_leetcode_id);
    networkUsernames = [...new Set(networkUsernames)];

    let networkData = allLeetcodeData.filter(u => networkUsernames.includes(u.username));
    networkData.sort((a, b) => getTotals(b).total - getTotals(a).total);

    renderGenericLeaderboard(networkData, 'podium-friends', 'rankList-friends', 'Link your profile or add friends to see rankings.');
}

// Render the Global Leaderboard
function renderGlobalLeaderboard() {
    let globalData = [...allLeetcodeData];
    globalData.sort((a, b) => getTotals(b).total - getTotals(a).total);

    renderGenericLeaderboard(globalData, 'podium-global', 'rankList-global', 'No users found in the database.');
}

// --- UTILS & INTERACTIONS ---
function getTotals(user) {
    const s = user.problems_solved || {};
    return { easy: s.Easy||0, medium: s.Medium||0, hard: s.Hard||0, total: (s.Easy||0) + (s.Medium||0) + (s.Hard||0) };
}
function getInitial(user) { return (user.name || user.username || 'U')[0].toUpperCase(); }
function formatRelative(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr);
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

// Tab Switching Logic
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// Modal Logic
document.getElementById('openModalBtn').addEventListener('click', () => {
    document.getElementById('modal').classList.add('open');
    document.getElementById('usernameInput').focus();
});
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
});
function closeModal() {
    document.getElementById('modal').classList.remove('open');
    document.getElementById('usernameInput').value = '';
}

// Add Friend Logic
document.getElementById('confirmBtn').addEventListener('click', async () => {
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) return showToast('Please enter a username', 'error');

    if (userData.friends.includes(username) || userData.my_leetcode_id === username) {
        return showToast('User is already tracked', 'error');
    }

    const btn = document.getElementById('confirmBtn');
    btn.disabled = true;
    btn.innerHTML = 'Adding...';

    try {
        const r = await fetch(`${API_BASE}?username=${encodeURIComponent(username)}`);
        const d = await r.json();
        
        if (d.status === 'success') {
            const userRef = doc(db, "users", currentUserUid);
            await updateDoc(userRef, { friends: arrayUnion(username) });
            
            userData.friends.push(username);
            showToast(`Added @${username}!`, 'success');
            closeModal();
            await loadData();
        } else {
            showToast(d.message || 'Failed to add user', 'error');
        }
    } catch (e) {
        showToast('Connection error', 'error');
    }
    btn.disabled = false;
    btn.innerHTML = 'Add Friend';
});

document.getElementById('refreshBtn').addEventListener('click', async () => {
    document.getElementById('refreshBtn').classList.add('spinning');
    await loadData();
    document.getElementById('refreshBtn').classList.remove('spinning');
    showToast('Data refreshed', 'success');
});

let toastTimer;
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    el.className = `toast ${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
function showError(msg) {
    document.getElementById('profileContent').innerHTML = `<div class="empty"><h3>Error</h3><p>${msg}</p></div>`;
}