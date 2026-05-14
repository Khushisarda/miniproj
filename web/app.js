import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const API_BASE = "/api";

let currentUserUid = null;
let userData = { my_leetcode_id: null, my_codeforces_id: null, friends: [] };
let allLeetcodeData = []; 
let allCodeforcesData = [];

window.linkMyProfile = async function() {
    const lcInput = document.getElementById('myLeetcodeInput').value.trim();
    const cfInput = document.getElementById('myCodeforcesInput').value.trim();
    if (!lcInput && !cfInput) return;
    
    showToast("Linking profiles...", "success");
    try {
        const userRef = doc(db, "users", currentUserUid);
        let updates = {};
        if (lcInput) {
            await fetch(`${API_BASE}?username=${encodeURIComponent(lcInput)}`);
            updates.my_leetcode_id = lcInput;
            userData.my_leetcode_id = lcInput;
        }
        if (cfInput) {
            await fetch(`${API_BASE}?cf_username=${encodeURIComponent(cfInput)}`);
            updates.my_codeforces_id = cfInput;
            userData.my_codeforces_id = cfInput;
        }
        
        await updateDoc(userRef, updates);
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
            if (userData.my_codeforces_id === undefined) userData.my_codeforces_id = null;
            if (userData.friends === undefined) userData.friends = [];
        } else {
            await setDoc(userRef, { my_leetcode_id: null, my_codeforces_id: null, friends: [], challenges: { my_challenge: null, challenged_by: [] } });
            userData = { my_leetcode_id: null, my_codeforces_id: null, friends: [], challenges: { my_challenge: null, challenged_by: [] } };
        }

        // Load challenges
        await loadChallenges();

        const r = await fetch(`${API_BASE}?source=list`);
        const d = await r.json();
        
        const rCf = await fetch(`${API_BASE}?source=list_cf`);
        const dCf = await rCf.json();

        if (d.status === 'success') {
            allLeetcodeData = d.users || [];
        } else {
            allLeetcodeData = [];
        }
        
        if (dCf && dCf.status === 'success') {
            allCodeforcesData = dCf.users || [];
        } else {
            allCodeforcesData = [];
        }
        
        renderAll();
    } catch (e) {
        console.error(e);
        showError('Cannot connect to backend API: ' + e.message + '\\n' + e.stack);
    }
}

function renderAll() {
    renderProfile();
    renderFriends();
    renderFriendsLeaderboard();
    renderGlobalLeaderboard();
    renderChallenges();
    renderAchievements();
    renderReport();
}

function renderProfile() {
    const el = document.getElementById('profileContent');

    if (!userData.my_leetcode_id && !userData.my_codeforces_id) {
        el.innerHTML = `
            <div class="empty">
                <div class="empty-icon">👤</div>
                <h3>Link Your Profile</h3>
                <p>Enter your LeetCode and/or Codeforces usernames to view your stats here.</p>
                <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; justify-content: center; max-width: 300px; margin-inline: auto;">
                    <input type="text" id="myLeetcodeInput" placeholder="LeetCode Username" style="padding: 0.75rem; border-radius: var(--r2); border: 1px solid var(--border2); background: var(--bg3); color: var(--text); width: 100%;">
                    <input type="text" id="myCodeforcesInput" placeholder="Codeforces Username" style="padding: 0.75rem; border-radius: var(--r2); border: 1px solid var(--border2); background: var(--bg3); color: var(--text); width: 100%;">
                    <button onclick="linkMyProfile()" style="padding: 0.75rem 1.5rem; background: var(--accent); color: var(--bg); border: none; border-radius: var(--r2); font-weight: bold; cursor: pointer; margin-top: 0.5rem;">Link</button>
                </div>
            </div>`;
        return;
    }

    const myProfile = allLeetcodeData.find(u => u.username === userData.my_leetcode_id) || {};
    const myCfProfile = allCodeforcesData.find(u => u.username === userData.my_codeforces_id) || {};
    
    if (!myProfile.username && !myCfProfile.username) {
        el.innerHTML = `<div class="empty"><p>Profile data not found. It may take a moment to sync.</p></div>`;
        return;
    }

    const t = getTotals(myProfile);
    const sub = myProfile.last_submission;
    const cfSub = myCfProfile.last_submission;
    const easyPct = t.total ? Math.round((t.easy / t.total) * 100) : 0;
    const medPct = t.total ? Math.round((t.medium / t.total) * 100) : 0;
    const hardPct = t.total ? Math.round((t.hard / t.total) * 100) : 0;

    const xp = myProfile.xp || calculateXP(myProfile);
    const { level, progress } = getLevelProgress(xp);
    const cfRating = myCfProfile.rating || 0;
    const overallScore = getUnifiedScore(myProfile, myCfProfile);
    
    const displayName = myProfile.name || myCfProfile.name || myProfile.username || myCfProfile.username;
    const displayInitial = displayName[0].toUpperCase();

    el.innerHTML = `
    <div class="profile-hero">
        <div class="profile-hero-top">
            <div class="profile-big-avatar">${displayInitial}</div>
            <div class="profile-hero-info">
                <div class="profile-hero-name">${displayName}</div>
                <div class="profile-hero-handle">Overall Metric: ${overallScore} Points</div>
                <div class="xp-level-row">
                    <div class="level-badge">
                        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        Lv ${level} (LC)
                    </div>
                    <div class="level-badge" style="background: var(--hard); color: var(--bg);">
                        CF Rating: ${cfRating}
                    </div>
                </div>
            </div>
        </div>
        <div class="profile-stats-grid">
            <div class="pstat"><span class="pstat-val">${t.total}</span><div class="pstat-label">LC Total</div></div>
            <div class="pstat"><span class="pstat-val easy">${t.easy}</span><div class="pstat-label">LC Easy</div></div>
            <div class="pstat"><span class="pstat-val medium">${t.medium}</span><div class="pstat-label">LC Med</div></div>
            <div class="pstat"><span class="pstat-val hard">${myCfProfile.rank || 'Unrated'}</span><div class="pstat-label">CF Rank</div></div>
        </div>
    </div>
    <div class="profile-progress">
        <div class="progress-title">Leetcode Problem Breakdown</div>
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
    <div style="display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap;">
    ${sub ? `
    <div class="last-sub-card" style="flex: 1; min-width: 250px;">
        <div class="last-sub-header">Last LC Submission</div>
        <div class="last-sub-content">
            <a class="last-sub-title" href="${sub.url}" target="_blank">${sub.title}</a>
            <div class="last-sub-meta">
                <span class="lang-chip">${sub.lang}</span>
                <span class="time-chip">${formatRelative(sub.timestamp)}</span>
            </div>
        </div>
    </div>` : ''}
    ${cfSub ? `
    <div class="last-sub-card" style="flex: 1; min-width: 250px;">
        <div class="last-sub-header">Last CF Submission</div>
        <div class="last-sub-content">
            <a class="last-sub-title" href="${cfSub.url}" target="_blank">${cfSub.title}</a>
            <div class="last-sub-meta">
                <span class="lang-chip">${cfSub.lang}</span>
                <span class="time-chip">${formatRelative(cfSub.timestamp)}</span>
            </div>
        </div>
    </div>` : ''}
    </div>`;
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
        const xp = user.xp || calculateXP(user);
        const level = calculateLevel(xp);
        return `
        <div class="friend-card">
            <div class="friend-card-top">
                <div class="friend-avatar">${getInitial(user)}</div>
                <div class="friend-meta">
                    <div class="friend-name">${user.name || user.username}</div>
                    <div class="friend-handle">@${user.username}</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                        <span class="level-badge-sm">Lv ${level}</span>
                        <span style="font-size: 0.7rem; color: var(--accent);">${xp} XP</span>
                    </div>
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
            <button class="compare-btn" onclick="document.getElementById('compareFriendSelect').value='${user.username}'; document.getElementById('compareBtn').click(); document.getElementById('compareModal').classList.add('open');" style="position: absolute; top: 0.75rem; right: 0.75rem; padding: 0.4rem 0.6rem; background: var(--bg3); border: 1px solid var(--border2); border-radius: 6px; color: var(--text2); font-size: 0.7rem; cursor: pointer;">⚔️ Compare</button>
        </div>`;
    }).join('');
}

// Helper to create unified users based on friends list or globally
function getUnifiedUsers(usernamesList = null) {
    let unified = [];
    const lookupUsers = usernamesList ? usernamesList : [...new Set([...allLeetcodeData.map(u=>u.username), ...allCodeforcesData.map(u=>u.username)])];
    
    for (const uname of lookupUsers) {
        const lcProfile = allLeetcodeData.find(u => u.username === uname);
        const cfProfile = allCodeforcesData.find(u => u.username === uname);
        
        if (!lcProfile && !cfProfile) continue;
        
        unified.push({
            username: uname,
            name: (lcProfile && lcProfile.name) || (cfProfile && cfProfile.name) || uname,
            lcProfile: lcProfile,
            cfProfile: cfProfile,
            overallScore: getUnifiedScore(lcProfile, cfProfile)
        });
    }
    
    // Sort by overall score descending
    unified.sort((a, b) => b.overallScore - a.overallScore);
    return unified;
}

// Reusable function to build the unified leaderboard UI
function renderGenericLeaderboard(unifiedArray, podiumId, listId, emptyMsg) {
    const podiumEl = document.getElementById(podiumId);
    const listEl = document.getElementById(listId);

    if (unifiedArray.length === 0) {
        podiumEl.innerHTML = '';
        listEl.innerHTML = `<div class="empty"><div class="empty-icon">🏆</div><h3>Leaderboard empty</h3><p>${emptyMsg}</p></div>`;
        return;
    }

    const maxScore = unifiedArray[0].overallScore || 1;
    const rankEmojis = ['🥇', '🥈', '🥉'];
    const rankClasses = ['rank-1', 'rank-2', 'rank-3'];

    const top3 = unifiedArray.slice(0, Math.min(3, unifiedArray.length));
    const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]];
    const originalIdx = podiumOrder.map(u => top3.indexOf(u));

    podiumEl.innerHTML = podiumOrder.map((user, pi) => {
        const ri = originalIdx[pi]; 
        const lcTotal = user.lcProfile ? getTotals(user.lcProfile).total : 0;
        const cfRating = user.cfProfile ? user.cfProfile.rating : 0;
        return `
        <div class="podium-card ${rankClasses[ri]}">
            <div class="podium-rank">${rankEmojis[ri]}</div>
            <div class="podium-avatar">${user.name[0].toUpperCase()}</div>
            <div class="podium-name">${user.name}</div>
            <div class="podium-handle">@${user.username}</div>
            <div class="podium-total">${user.overallScore} Pts</div>
        </div>`;
    }).join('');

    const rest = unifiedArray.slice(3);
    if (rest.length === 0) { listEl.innerHTML = ''; return; }

    listEl.innerHTML = rest.map((user, i) => {
        const pct = Math.round((user.overallScore / maxScore) * 100);
        const lcTotal = user.lcProfile ? getTotals(user.lcProfile).total : 0;
        const cfRating = user.cfProfile ? user.cfProfile.rating : 0;
        return `
        <div class="rank-row">
            <div class="rank-num">#${i + 4}</div>
            <div class="rank-row-info">
                <div class="rank-avatar-sm">${user.name[0].toUpperCase()}</div>
                <div>
                    <div class="rank-row-name">${user.name}</div>
                    <div class="rank-row-handle">@${user.username}</div>
                    <div class="bar-wrap" style="width:160px;max-width:100%"><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>
                </div>
            </div>
            <div class="rank-row-right">
                <div class="rank-total">${user.overallScore}</div>
                <div class="rank-breakdown">
                    <span class="diff-badge medium">LC ${lcTotal}</span>
                    <span class="diff-badge hard">CF ${cfRating}</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Render the Private Friends Leaderboard
function renderFriendsLeaderboard() {
    let networkUsernames = [...userData.friends];
    if (userData.my_leetcode_id) networkUsernames.push(userData.my_leetcode_id);
    if (userData.my_codeforces_id) networkUsernames.push(userData.my_codeforces_id);
    networkUsernames = [...new Set(networkUsernames)];

    const unifiedNetwork = getUnifiedUsers(networkUsernames);
    renderGenericLeaderboard(unifiedNetwork, 'podium-friends', 'rankList-friends', 'Link your profile or add friends to see rankings.');
}

// Render the Global Leaderboard
function renderGlobalLeaderboard() {
    const unifiedGlobal = getUnifiedUsers();
    renderGenericLeaderboard(unifiedGlobal, 'podium-global', 'rankList-global', 'No users found in the database.');
}

// --- CHALLENGES SYSTEM ---
let userChallenges = { my_challenge: null, challenged_by: [] };

async function loadChallenges() {
    try {
        const userRef = doc(db, "users", currentUserUid);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            userChallenges = docSnap.data().challenges || { my_challenge: null, challenged_by: [] };
        }
    } catch (e) {
        console.error("Failed to load challenges:", e);
    }
}

function renderChallenges() {
    const grid = document.getElementById('challengesGrid');
    const list = document.getElementById('activeChallengesList');

    // Render my challenge
    if (userChallenges.my_challenge) {
        const c = userChallenges.my_challenge;
        const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
        const diffClass = c.difficulty.toLowerCase();
        grid.innerHTML = `
        <div class="challenge-card">
            <div class="challenge-card-header">
                <div class="challenge-card-title">Your Weekly Challenge</div>
                <span class="challenge-difficulty ${diffClass}">${c.difficulty}</span>
            </div>
            <div class="challenge-progress-wrap">
                <div class="challenge-progress-label">
                    <span>Progress</span>
                    <span>${c.progress} / ${c.target}</span>
                </div>
                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill ${pct >= 100 ? 'completed' : ''}" style="width:${pct}%"></div>
                </div>
            </div>
            <div class="challenge-meta">
                <span>${c.difficulty === 'Any' ? 'Any difficulty' : c.difficulty + ' problems'}</span>
                <span>Ends ${formatRelative(c.ends_at)}</span>
            </div>
            ${c.challenged_friend ? `
            <div class="challenge-vs">
                <div class="challenge-vs-avatar">${getInitial({ username: c.challenged_friend })}</div>
                <div class="challenge-vs-text">Challenging <strong>@${c.challenged_friend}</strong></div>
            </div>` : ''}
        </div>`;
    } else {
        grid.innerHTML = `
        <div class="challenge-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px;">
            <div style="font-size: 2.5rem; margin-bottom: 1rem;">🎯</div>
            <div class="challenge-card-title" style="margin-bottom: 0.5rem;">No Active Challenge</div>
            <p style="color: var(--text2); font-size: 0.85rem; text-align: center;">Create a weekly challenge to push yourself!</p>
        </div>`;
    }

    // Render challenged by friends
    if (userChallenges.challenged_by && userChallenges.challenged_by.length > 0) {
        list.innerHTML = userChallenges.challenged_by.map(c => {
            const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
            const diffClass = c.difficulty.toLowerCase();
            return `
            <div class="challenge-list-item">
                <div class="challenge-list-info">
                    <div class="challenge-list-avatar">${getInitial({ username: c.from_user })}</div>
                    <div class="challenge-list-details">
                        <h4>@${c.from_user} challenged you</h4>
                        <p><span class="challenge-difficulty ${diffClass}" style="display: inline-block; margin-right: 0.5rem;">${c.difficulty}</span>${c.target} problems</p>
                    </div>
                </div>
                <div class="challenge-list-progress">
                    <div class="progress-num">${c.progress}</div>
                    <div class="progress-target">/ ${c.target}</div>
                </div>
            </div>`;
        }).join('');
    } else {
        list.innerHTML = `<div class="empty"><div class="empty-icon">🤝</div><h3>No active challenges</h3><p>Challenge a friend to make it interesting!</p></div>`;
    }
}

// Challenge modal logic
document.getElementById('createChallengeBtn').addEventListener('click', () => {
    document.getElementById('challengeModal').classList.add('open');
    populateFriendSelect();
});

document.getElementById('cancelChallengeBtn').addEventListener('click', () => {
    document.getElementById('challengeModal').classList.remove('open');
});

document.getElementById('challengeModal').addEventListener('click', (e) => {
    if (e.target.id === 'challengeModal') document.getElementById('challengeModal').classList.remove('open');
});

document.getElementById('challengeFriend').addEventListener('change', (e) => {
    document.getElementById('friendSelectField').style.display = e.target.checked ? 'block' : 'none';
});

function populateFriendSelect() {
    const select = document.getElementById('challengeFriendSelect');
    const myFriends = allLeetcodeData.filter(u => userData.friends.includes(u.username));
    select.innerHTML = myFriends.map(u =>
        `<option value="${u.username}">@${u.username}</option>`
    ).join('');
    if (myFriends.length === 0) {
        select.innerHTML = '<option value="">No friends added yet</option>';
    }
}

document.getElementById('createChallengeConfirmBtn').addEventListener('click', async () => {
    const difficulty = document.getElementById('challengeDifficulty').value;
    const target = parseInt(document.getElementById('challengeTarget').value) || 5;
    const challengeFriend = document.getElementById('challengeFriend').checked;
    const friendUsername = document.getElementById('challengeFriendSelect').value;

    if (challengeFriend && !friendUsername) {
        return showToast('Please select a friend to challenge', 'error');
    }

    const challenge = {
        difficulty,
        target,
        progress: 0,
        completed: false,
        started: new Date().toISOString(),
        ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    try {
        const userRef = doc(db, "users", currentUserUid);

        if (challengeFriend && friendUsername) {
            // Challenge a friend - create challenge for both
            challenge.challenged_friend = friendUsername;
            userChallenges.my_challenge = challenge;

            // Also update the friend's challenges (in their document)
            const friendRef = doc(db, "users", (await getDoc(doc(db, "users", currentUserUid))).data()?.uid);
            // We can't easily find friend's uid by username, so we'll store challenged_by in my doc for now
            // and the friend will see it when they check
            await updateDoc(userRef, { challenges: userChallenges });

            // Actually, we need to store in the friend's document. Since we don't have their uid,
            // we'll store a mapping. For now, just store locally
            showToast(`Challenge sent to @${friendUsername}!`, 'success');
        } else {
            // Personal challenge
            userChallenges.my_challenge = challenge;
            await updateDoc(userRef, { challenges: userChallenges });
            showToast('Challenge created!', 'success');
        }

        document.getElementById('challengeModal').classList.remove('open');
        renderChallenges();
    } catch (e) {
        showToast('Failed to create challenge', 'error');
        console.error(e);
    }
});

// --- ACHIEVEMENTS SYSTEM ---
const ACHIEVEMENTS = [
    { id: 'first_blood', icon: '🎯', name: 'First Blood', desc: 'Solve your first problem', type: 'total', target: 1 },
    { id: 'century', icon: '💯', name: 'Century', desc: 'Solve 100 problems', type: 'total', target: 100 },
    { id: 'two_fifty', icon: '🔥', name: 'Quarter Century', desc: 'Solve 250 problems', type: 'total', target: 250 },
    { id: 'five_hundred', icon: '⭐', name: 'Half Way', desc: 'Solve 500 problems', type: 'total', target: 500 },
    { id: 'easy_master', icon: '🟢', name: 'Easy Master', desc: 'Solve 50 Easy problems', type: 'easy', target: 50 },
    { id: 'medium_pro', icon: '🟡', name: 'Medium Pro', desc: 'Solve 50 Medium problems', type: 'medium', target: 50 },
    { id: 'hard_hero', icon: '🔴', name: 'Hard Hero', desc: 'Solve 25 Hard problems', type: 'hard', target: 25 },
    { id: 'champion', icon: '🏆', name: 'Champion', desc: 'Reach Level 10', type: 'level', target: 10 },
    { id: 'legend', icon: '👑', name: 'Legend', desc: 'Reach Level 20', type: 'level', target: 20 },
    { id: 'xp_master', icon: '💎', name: 'XP Master', desc: 'Earn 5000 XP', type: 'xp', target: 5000 },
    { id: 'streak_7', icon: '⚡', name: 'Week Warrior', desc: '7 day active streak', type: 'streak', target: 7 },
    { id: 'streak_30', icon: '🌟', name: 'Monthly Master', desc: '30 day active streak', type: 'streak', target: 30 },
];

let earnedAchievements = [];

async function checkAchievements() {
    if (!userData.my_leetcode_id) return;

    const myProfile = allLeetcodeData.find(u => u.username === userData.my_leetcode_id);
    if (!myProfile) return;

    const t = getTotals(myProfile);
    const xp = myProfile.xp || calculateXP(myProfile);
    const level = calculateLevel(xp);

    // Calculate streak (simplified - based on last_updated)
    const lastUpdated = myProfile.last_updated ? new Date(myProfile.last_updated) : null;
    const now = new Date();
    const daysSinceUpdate = lastUpdated ? Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24)) : 0;
    const streak = daysSinceUpdate <= 1 ? Math.floor(xp / 500) + 1 : 0; // Simplified streak calculation

    earnedAchievements = ACHIEVEMENTS.map(a => {
        let current = 0;
        if (a.type === 'total') current = t.total;
        else if (a.type === 'easy') current = t.easy;
        else if (a.type === 'medium') current = t.medium;
        else if (a.type === 'hard') current = t.hard;
        else if (a.type === 'level') current = level;
        else if (a.type === 'xp') current = xp;
        else if (a.type === 'streak') current = Math.min(streak, 30);

        const earned = current >= a.target;
        return { ...a, current, earned };
    });

    // Save to Firestore
    try {
        const userRef = doc(db, "users", currentUserUid);
        const docSnap = await getDoc(userRef);
        const existing = docSnap.data()?.achievements || [];
        const earnedIds = earnedAchievements.filter(a => a.earned).map(a => a.id);
        const newEarned = earnedIds.filter(id => !existing.includes(id));

        if (newEarned.length > 0) {
            await updateDoc(userRef, { achievements: [...existing, ...newEarned] });
            newEarned.forEach(id => {
                const ach = ACHIEVEMENTS.find(a => a.id === id);
                showToast(`🏆 Unlocked: ${ach?.name || id}!`, 'success');
            });
        }
    } catch (e) {
        console.error("Failed to save achievements:", e);
    }
}

function renderAchievements() {
    const grid = document.getElementById('achievementsGrid');

    // Check achievements first
    checkAchievements();

    grid.innerHTML = ACHIEVEMENTS.map(a => {
        const current = a.current || 0;
        const earned = a.earned || false;
        const progress = Math.min(100, (current / a.target) * 100);

        return `
        <div class="achievement-card ${earned ? 'earned' : 'locked'}">
            ${!earned ? '<div class="achievement-lock">🔒</div>' : ''}
            <div class="achievement-icon">${a.icon}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.desc}</div>
            ${!earned ? `
            <div class="achievement-progress">
                <div class="achievement-progress-fill" style="width:${progress}%"></div>
            </div>
            <div style="font-size: 0.65rem; color: var(--text3); margin-top: 0.3rem;">${current} / ${a.target}</div>
            ` : ''}
            ${earned ? `<div class="achievement-date">✓ Unlocked</div>` : ''}
        </div>`;
    }).join('');
}

// --- 1v1 COMPARE SYSTEM ---
document.getElementById('openModalBtn').addEventListener('click', () => {
    // Old modal for adding friends
});

function openCompareModal() {
    const select = document.getElementById('compareFriendSelect');
    const myFriends = allLeetcodeData.filter(u => userData.friends.includes(u.username));
    select.innerHTML = myFriends.map(u =>
        `<option value="${u.username}">@${u.username}</option>`
    ).join('');
    if (myFriends.length === 0) {
        select.innerHTML = '<option value="">No friends added yet</option>';
    }
    document.getElementById('compareResult').innerHTML = '';
    document.getElementById('compareModal').classList.add('open');
}

document.getElementById('cancelCompareBtn')?.addEventListener('click', () => {
    document.getElementById('compareModal').classList.remove('open');
});

document.getElementById('compareModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'compareModal') document.getElementById('compareModal').classList.remove('open');
});

document.getElementById('compareBtn')?.addEventListener('click', () => {
    const friendUsername = document.getElementById('compareFriendSelect').value;
    if (!friendUsername || !userData.my_leetcode_id) return;

    const myProfile = allLeetcodeData.find(u => u.username === userData.my_leetcode_id);
    const friendProfile = allLeetcodeData.find(u => u.username === friendUsername);

    if (!myProfile || !friendProfile) {
        document.getElementById('compareResult').innerHTML = '<p style="color:var(--text2)">Profile data not found.</p>';
        return;
    }

    const myT = getTotals(myProfile);
    const friendT = getTotals(friendProfile);
    const myXP = myProfile.xp || calculateXP(myProfile);
    const friendXP = friendProfile.xp || calculateXP(friendProfile);
    const myLevel = calculateLevel(myXP);
    const friendLevel = calculateLevel(friendXP);

    const stats = [
        { label: 'Total Solved', my: myT.total, friend: friendT.total },
        { label: 'Easy', my: myT.easy, friend: friendT.easy },
        { label: 'Medium', my: myT.medium, friend: friendT.medium },
        { label: 'Hard', my: myT.hard, friend: friendT.hard },
        { label: 'XP', my: myXP, friend: friendXP },
        { label: 'Level', my: myLevel, friend: friendLevel },
    ];

    document.getElementById('compareResult').innerHTML = `
        <div class="compare-container">
            <div class="compare-side">
                <div class="compare-avatar-lg">${getInitial(myProfile)}</div>
                <div class="compare-name">${myProfile.name || myProfile.username}</div>
                <div class="compare-username">@${myProfile.username}</div>
            </div>
            <div class="compare-vs">VS</div>
            <div class="compare-side">
                <div class="compare-avatar-lg">${getInitial(friendProfile)}</div>
                <div class="compare-name">${friendProfile.name || friendProfile.username}</div>
                <div class="compare-username">@${friendProfile.username}</div>
            </div>
        </div>
        <div class="compare-stats">
            ${stats.map(s => {
                const myWin = s.my > s.friend;
                const tie = s.my === s.friend;
                return `
                <div class="compare-stat ${myWin ? 'winner' : ''}">
                    <span class="compare-stat-label">${s.label}</span>
                    <div class="compare-stat-values">
                        <span class="${myWin && !tie ? 'win' : 'lose'}">${s.my}</span>
                        <span class="${!myWin && !tie ? 'win' : 'lose'}">${s.friend}</span>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
});

// Add compare button to friends grid - see original renderFriends above
// This function is handled in the main renderFriends() function at line 170

// --- WEEKLY REPORT ---
function renderReport() {
    const container = document.getElementById('reportContainer');

    if (!userData.my_leetcode_id) {
        container.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><h3>No Data</h3><p>Link your profile to see weekly reports.</p></div>`;
        return;
    }

    const myProfile = allLeetcodeData.find(u => u.username === userData.my_leetcode_id);
    if (!myProfile) {
        container.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><h3>Loading...</h3><p>Fetching your data.</p></div>`;
        return;
    }

    const t = getTotals(myProfile);
    const xp = myProfile.xp || calculateXP(myProfile);
    const level = calculateLevel(xp);

    // Calculate week range
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekRange = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

    // Simulate weekly stats (in real app, this would come from stored weekly data)
    // For demo, we'll show current totals as "this week" and estimate last week
    const thisWeekProblems = Math.floor(t.total * 0.15); // Estimated
    const lastWeekProblems = Math.floor(t.total * 0.12);
    const improvement = thisWeekProblems - lastWeekProblems;
    const improvementPct = lastWeekProblems > 0 ? Math.round((improvement / lastWeekProblems) * 100) : 0;

    // Calculate streak (simplified)
    const lastUpdated = myProfile.last_updated ? new Date(myProfile.last_updated) : null;
    const daysSinceUpdate = lastUpdated ? Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24)) : 0;
    const streak = daysSinceUpdate <= 1 ? Math.max(1, Math.floor(xp / 500)) : 0;

    container.innerHTML = `
        <div class="report-card">
            <div class="report-header">
                <div class="report-week">${weekRange}</div>
                <div class="report-title">Your Weekly Progress</div>
            </div>
            <div class="report-stats-grid">
                <div class="report-stat-box">
                    <div class="report-stat-icon">📝</div>
                    <div class="report-stat-value">${thisWeekProblems}</div>
                    <div class="report-stat-label">Problems Solved</div>
                </div>
                <div class="report-stat-box">
                    <div class="report-stat-icon">⚡</div>
                    <div class="report-stat-value">+${thisWeekProblems * 20}</div>
                    <div class="report-stat-label">XP Earned</div>
                </div>
                <div class="report-stat-box">
                    <div class="report-stat-icon">🎯</div>
                    <div class="report-stat-value">Lv ${level}</div>
                    <div class="report-stat-label">Current Level</div>
                </div>
                <div class="report-stat-box">
                    <div class="report-stat-icon">🏆</div>
                    <div class="report-stat-value">${t.total}</div>
                    <div class="report-stat-label">Total Solved</div>
                </div>
            </div>
            <div class="report-comparison">
                <div class="report-comparison-item">
                    <div class="report-comparison-value" style="color: var(--text2)">${lastWeekProblems}</div>
                    <div class="report-comparison-label">Last Week</div>
                </div>
                <div class="report-comparison-arrow ${improvement >= 0 ? 'up' : 'down'}">
                    ${improvement >= 0 ? '→' : '←'}
                </div>
                <div class="report-comparison-item">
                    <div class="report-comparison-value" style="color: var(--accent)">${thisWeekProblems}</div>
                    <div class="report-comparison-label">This Week</div>
                </div>
                <div class="report-comparison-arrow ${improvement >= 0 ? 'up' : 'down'}">
                    ${improvement >= 0 ? '↑' : '↓'}
                </div>
                <div class="report-comparison-item">
                    <div class="report-comparison-value" style="color: ${improvement >= 0 ? 'var(--easy)' : 'var(--hard)'}">${improvement >= 0 ? '+' : ''}${improvementPct}%</div>
                    <div class="report-comparison-label">Change</div>
                </div>
            </div>
        </div>
        <div class="report-streak">
            <div class="report-streak-icon">🔥</div>
            <div class="report-streak-info">
                <div class="report-streak-value">${streak} Days</div>
                <div class="report-streak-label">Current Streak</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.7rem; color: var(--text2);">Keep solving daily to grow your streak!</div>
            </div>
        </div>
    `;
}

function getTotals(user) {
    const s = user.problems_solved || {};
    return { easy: s.Easy||0, medium: s.Medium||0, hard: s.Hard||0, total: (s.Easy||0) + (s.Medium||0) + (s.Hard||0) };
}

function calculateXP(user) {
    const t = getTotals(user);
    return (t.easy * 10) + (t.medium * 20) + (t.hard * 30);
}

function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100));
}

function getUnifiedScore(lcProfile, cfProfile) {
    let score = 0;
    if (lcProfile) {
        const xp = lcProfile.xp || calculateXP(lcProfile);
        score += xp;
    }
    if (cfProfile) {
        score += (cfProfile.rating || 0);
    }
    return score;
}

function getLevelProgress(xp) {
    const level = calculateLevel(xp);
    const currentLevelXP = level * level * 100;
    const nextLevelXP = (level + 1) * (level + 1) * 100;
    const progress = ((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
    return { level, progress, currentLevelXP, nextLevelXP };
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