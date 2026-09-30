// --- Audio System (Web Audio API Synthesizer) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;

    if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'explode') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'ram') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    }
}

let engineOsc = null;
let engineGain = null;

function initEngine() {
    if (engineOsc) return;
    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    let filter = audioCtx.createBiquadFilter();
    
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, audioCtx.currentTime);
    
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
    engineOsc.start();
}

// --- DOM Elements ---
const modeSwitch = document.getElementById('modeSwitch');
const normalMode = document.getElementById('normalMode');
const gameMode = document.getElementById('gameMode');
const sections = document.querySelectorAll('.section');
const normalBg = document.getElementById('normalBg');

// --- Normal Mode: Exquisite Scroll & Hover Animations ---
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
            setTimeout(() => { entry.target.classList.add('show'); }, index * 100);
        }
    });
}, { threshold: 0.1 });

sections.forEach(section => observer.observe(section));

document.querySelectorAll('.card-3d').forEach(card => {
    card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -12; 
        const rotateY = ((x - centerX) / centerX) * 12;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    });
});

// --- Toggle Logic ---
modeSwitch.addEventListener('change', (e) => {
    e.target.blur(); // Remove focus so spacebar doesn't toggle this!
    if (audioCtx.state === 'suspended') audioCtx.resume();
    initEngine();

    if(e.target.checked) {
        normalMode.classList.remove('active');
        normalBg.style.display = 'none';
        gameMode.classList.add('active');
        document.body.style.overflow = 'hidden';
        initGame();
    } else {
        if (engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        gameMode.classList.remove('active');
        normalMode.classList.add('active');
        normalBg.style.display = 'block';
        document.body.style.overflow = 'auto';
        cancelAnimationFrame(animationFrameId);
    }
});

// --- Game Mode Logic ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let animationFrameId;

const hudPanel = document.getElementById('hudPanel');
const hudTitle = document.getElementById('hudTitle');
const hudContent = document.getElementById('hudContent');
const gameInstructions = document.getElementById('gameInstructions');
const warpOverlay = document.getElementById('warpOverlay');

const combatSwitch = document.getElementById('combatSwitch');
const scoreBoard = document.getElementById('scoreBoard');
const currentScoreText = document.getElementById('currentScoreText');
const highScoreText = document.getElementById('highScoreText');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, ' ': false };
window.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key)) keys[e.key] = true; });
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key)) keys[e.key] = false; });

const player = { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, maxSpeed: 10, friction: 0.95, acceleration: 0.5, rotationSpeed: 0.08, size: 20 };

let currentSceneId = 'galaxy';
let isWarping = false;
let defaultHudHtml = '';

// Combat State
let combatMode = false;
let score = 0;
let highScore = 0;
try { highScore = parseInt(localStorage.getItem('portfolioHighScore')) || 0; } catch(e){}

let lasers = [];
let enemies = [];
let particles = [];
let lastShotTime = 0;
let lastEnemySpawnTime = 0;
let currentSpawnInterval = 2000;

function updateScoreBoard() {
    if (score > highScore) {
        highScore = score;
        try { localStorage.setItem('portfolioHighScore', highScore); } catch(e){}
    }
    currentScoreText.innerText = 'Current Score: ' + score;
    highScoreText.innerText = 'High Score: ' + highScore;
}

combatSwitch.addEventListener('change', (e) => {
    e.target.blur(); // Remove focus to fix the spacebar toggle bug!
    if (audioCtx.state === 'suspended') audioCtx.resume();

    combatMode = e.target.checked;
    if (combatMode) {
        scoreBoard.style.display = 'block';
        document.getElementById('mobileShoot').style.display = 'flex';
        updateScoreBoard();
        gameInstructions.innerHTML = 'Combat <span style="color:#ef4444">ON</span>! Press <b>SPACE</b> to shoot lasers!';
        lastEnemySpawnTime = Date.now();
    } else {
        scoreBoard.style.display = 'none';
        document.getElementById('mobileShoot').style.display = 'none';
        enemies = []; lasers = []; particles = [];
        score = 0;
        currentSpawnInterval = 2000;
        updateScoreBoard();
        gameInstructions.innerHTML = 'Use <b>W,A,S,D</b> to fly. Enter a <span style="color:#ef4444">Wormhole</span> or hit a Planet.';
    }
});

const scenes = {
    galaxy: {
        title: 'Milky Way',
        objects: [
            { id: 'about', type: 'warp', label: 'About System', x: -500, y: -300, r: 90, color: '#38bdf8' },
            { id: 'skills', type: 'warp', label: 'Skills System', x: 600, y: -200, r: 100, color: '#a855f7' },
            { id: 'projects', type: 'warp', label: 'Projects System', x: -400, y: 400, r: 120, color: '#10b981' },
            { id: 'edu', type: 'warp', label: 'Education System', x: 500, y: 300, r: 95, color: '#f59e0b' }
        ]
    },
    about: {
        title: 'System: About Me',
        color: '#38bdf8',
        defaultHtml: '<p>AI & ML Engineer studying at IEM Kolkata.</p><p>Passionate about writing clean code and building intelligent, scalable solutions in <strong style="color:#38bdf8">Python</strong>.</p><p>I am also a core member of <strong style="color:#10b981">Innovation Innitiative</strong>, building digital platforms.</p>',
        objects: [
            { type: 'exit', label: 'Wormhole to Galaxy', x: 0, y: 350, r: 60, color: '#ef4444' },
            { type: 'info', label: 'Innovation Innitiative', html: '<h3 style="color:#10b981">Innovation Innitiative</h3><p>My collaborative tech group dedicated to crafting engaging experiences.</p><a href="https://www.innovationinnitiative.in/" target="_blank" class="live-link-game" style="color:#10b981; border-color:#10b981;">Visit the Hub ↗</a>', x: -250, y: -150, r: 70, color: '#10b981' }
        ]
    },
    skills: {
        title: 'System: Skills',
        color: '#a855f7',
        defaultHtml: '<p>Fly into a sub-planet to view specific skill sets.</p>',
        objects: [
            { type: 'exit', label: 'Wormhole to Galaxy', x: 0, y: 450, r: 60, color: '#ef4444' },
            { type: 'info', label: 'Programming', html: '<h3 style="color:#c084fc">Programming Languages</h3><ul><li>Python</li><li>C</li></ul>', x: -300, y: -200, r: 60, color: '#c084fc' },
            { type: 'info', label: 'Core CS', html: '<h3 style="color:#d8b4fe">Core Computer Science</h3><ul><li>Data Structures & Algorithms</li><li>Object-Oriented Programming</li><li>DBMS & Operating Systems</li><li>Networking</li></ul>', x: 300, y: -200, r: 70, color: '#d8b4fe' },
            { type: 'info', label: 'Databases & Web', html: '<h3 style="color:#a855f7">Databases & Web</h3><ul><li>SQL & Relational Databases</li><li>REST APIs</li><li>HTML/CSS, JavaScript</li></ul>', x: -250, y: 150, r: 65, color: '#a855f7' },
            { type: 'info', label: 'Frameworks', html: '<h3 style="color:#9333ea">Tools & Frameworks</h3><ul><li>Git Version Control</li><li>Flask</li><li>Scikit-Learn</li><li>OpenCV</li></ul>', x: 250, y: 150, r: 60, color: '#9333ea' }
        ]
    },
    projects: {
        title: 'System: Projects',
        color: '#10b981',
        defaultHtml: '<p>Fly into a sub-planet to view detailed project logs and live deployments.</p>',
        objects: [
            { type: 'exit', label: 'Wormhole to Galaxy', x: 0, y: 550, r: 60, color: '#ef4444' },
            { type: 'info', label: 'finSense', html: '<h3 style="color:#34d399">finSense</h3><p>Financial News Sentiment Aggregator.</p><p><em>Python, APIs, Data Analytics.</em></p><ul><li>Analyzes real-time market sentiment data.</li></ul><a href="https://finsense.innovationinnitiative.in/" target="_blank" class="live-link-game" style="color:#34d399; border-color:#34d399;">View Live Project ↗</a>', x: -300, y: -250, r: 80, color: '#34d399' },
            { type: 'info', label: 'NexusLoot', html: '<h3 style="color:#60a5fa">NexusLoot FreeGame</h3><p>Web Development</p><p><em>Gaming / Rewards Platform.</em></p><ul><li>Engaging web-based gaming ecosystem.</li></ul><a href="https://nexusloot.innovationinnitiative.in/freegame" target="_blank" class="live-link-game" style="color:#60a5fa; border-color:#60a5fa;">Play NexusLoot ↗</a>', x: 300, y: -250, r: 75, color: '#60a5fa' },
            { type: 'info', label: 'Attendance', html: '<h3 style="color:#059669">Attendance Tracker</h3><p>Wi-Fi Beacons & Face Recognition</p><p><em>Python, SQL, OpenCV.</em></p><ul><li>Automated tracking implementing OOP.</li></ul>', x: -300, y: 150, r: 70, color: '#059669' },
            { type: 'info', label: 'TRAP', html: '<h3 style="color:#047857">TRAP Protocol</h3><p>Resilient Autoencoding Protocol</p><p><em>Python, Torch, Cryptography.</em></p><ul><li>Reconstructs secure messages under extreme attacks.</li></ul>', x: 300, y: 150, r: 65, color: '#047857' }
        ]
    },
    edu: {
        title: 'System: Education',
        color: '#f59e0b',
        defaultHtml: '<p>Fly into a sub-planet to view academic and certification details.</p>',
        objects: [
            { type: 'exit', label: 'Wormhole to Galaxy', x: 0, y: 400, r: 60, color: '#ef4444' },
            { type: 'info', label: 'Degrees', html: '<h3 style="color:#fbbf24">B.Tech AI & ML</h3><p>IEM Kolkata (CGPA: 7.94)</p><br><h3 style="color:#fbbf24">12th Standard</h3><p>Hariyana Vidya Mandir (72.33%)</p>', x: -250, y: -150, r: 75, color: '#fbbf24' },
            { type: 'info', label: 'Papers & Certs', html: '<h3 style="color:#f59e0b">Published Paper</h3><p>ML-Based Criminal Identification System (iSSSC 2025). 91% Accuracy.</p><br><h3 style="color:#f59e0b">Certifications</h3><ul><li>Gen AI (IISC Bangalore)</li><li>HCI (IIIT Delhi)</li><li>AWS Cloud Practitioner</li><li>Google Data Analytics</li></ul>', x: 250, y: -150, r: 85, color: '#f59e0b' }
        ]
    }
};

let stars = [];
function generateStars() {
    stars = [];
    for(let i=0; i<300; i++) {
        stars.push({
            x: Math.random() * window.innerWidth * 3 - window.innerWidth,
            y: Math.random() * window.innerHeight * 3 - window.innerHeight,
            size: Math.random() * 2 + 0.5,
            alpha: Math.random()
        });
    }
}

function warpTo(sceneId) {
    if(isWarping) return;
    isWarping = true;
    if (engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    
    warpOverlay.classList.add('warping');
    
    setTimeout(() => {
        currentSceneId = sceneId;
        const scene = scenes[currentSceneId];
        
        player.x = 0;
        player.y = (sceneId === 'galaxy') ? 0 : -350; 
        player.vx = 0; player.vy = 0;
        keys.w = keys.a = keys.s = keys.d = keys.ArrowUp = keys.ArrowDown = keys.ArrowLeft = keys.ArrowRight = false;
        
        lasers = []; enemies = []; particles = [];

        if (sceneId === 'galaxy') {
            hudPanel.classList.remove('active');
            if(!combatMode) gameInstructions.innerHTML = 'Use <b>W,A,S,D</b> to fly. Fly into a <span style="color:var(--accent)">Planet</span> to enter its system!';
        } else {
            hudTitle.textContent = scene.title;
            hudTitle.style.color = scene.color;
            hudTitle.style.borderBottomColor = scene.color;
            hudPanel.style.borderLeftColor = scene.color;
            hudContent.innerHTML = scene.defaultHtml;
            hudPanel.classList.add('active');
            defaultHudHtml = scene.defaultHtml;
            if(!combatMode) gameInstructions.innerHTML = 'Fly into <span style="color:#a855f7">Sub-planets</span> for info. Enter the <span style="color:#ef4444">Red Wormhole</span> to return.';
        }

        setTimeout(() => { warpOverlay.classList.remove('warping'); isWarping = false; }, 400); 
    }, 400); 
}

function initGame() {
    resizeCanvas();
    generateStars();
    warpTo('galaxy'); 
    update();
}

function drawSpaceship(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    if (!isWarping && (keys.w || keys.ArrowUp)) {
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.moveTo(-15, -5); ctx.lineTo(-35 - Math.random()*20, 0); ctx.lineTo(-15, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.moveTo(-15, -2); ctx.lineTo(-25 - Math.random()*10, 0); ctx.lineTo(-15, 2); ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-15, 18); ctx.lineTo(-10, 0); ctx.lineTo(-15, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.ellipse(5, 0, 8, 4, 0, 0, Math.PI*2); ctx.fill();
    
    ctx.restore();
}

function drawWormhole(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Date.now() * 0.003);
    
    for(let i=0; i<4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r - i*12, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(239, 68, 68, ${1 - i*0.2})`;
        ctx.lineWidth = 4;
        ctx.setLineDash([20, 15]);
        ctx.stroke();
    }
    
    ctx.beginPath(); ctx.arc(0, 0, r*0.3, 0, Math.PI*2);
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.strokeStyle = '#ef4444'; ctx.setLineDash([]); ctx.stroke();
    
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("Exit System", x, y - r - 20);
}

function drawPlanet(obj) {
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.r, 0, Math.PI*2);
    const gradient = ctx.createRadialGradient(obj.x - obj.r*0.3, obj.y - obj.r*0.3, obj.r*0.1, obj.x, obj.y, obj.r);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(0.3, obj.color);
    gradient.addColorStop(1, '#000');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.r + 15, 0, Math.PI*2);
    ctx.fillStyle = obj.color;
    ctx.globalAlpha = 0.2 + Math.sin(Date.now()*0.002)*0.1;
    ctx.fill();
    
    if (obj.type === 'info') {
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y, obj.r * 1.8, obj.r * 0.5, Math.PI/6, 0, Math.PI*2);
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(obj.label, obj.x, obj.y - obj.r - 25);
}

function checkCollisions() {
    if (isWarping) return;
    const currentScene = scenes[currentSceneId];
    let infoHovered = false;

    for (let obj of currentScene.objects) {
        const dx = player.x - obj.x;
        const dy = player.y - obj.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        if (distance < obj.r + player.size) {
            if (obj.type === 'warp') {
                warpTo(obj.id);
            } else if (obj.type === 'exit') {
                warpTo('galaxy');
            } else if (obj.type === 'info') {
                infoHovered = true;
                if(hudContent.innerHTML !== obj.html) {
                    hudContent.innerHTML = obj.html;
                    hudPanel.style.transform = 'translateX(0) scale(1.02)';
                    setTimeout(() => hudPanel.style.transform = 'translateX(0) scale(1)', 150);
                }
            }
        }
    }

    if (!infoHovered && currentSceneId !== 'galaxy' && hudContent.innerHTML !== defaultHudHtml) {
        hudContent.innerHTML = defaultHudHtml;
    }
}

function drawRadar() {
    if (currentSceneId !== 'galaxy') return; 
    
    ctx.save();
    const padding = 20;
    const radarSize = 120;
    const rx = canvas.width - radarSize - padding;
    const ry = padding + 60; 
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(rx, ry, radarSize, radarSize); ctx.fill(); ctx.stroke();
    
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(rx + radarSize/2, ry + radarSize/2, 2, 0, Math.PI*2); ctx.fill();
    
    scenes.galaxy.objects.forEach(node => {
        const dx = (node.x - player.x) * 0.04;
        const dy = (node.y - player.y) * 0.04;
        if(Math.abs(dx) < radarSize/2 && Math.abs(dy) < radarSize/2) {
            ctx.fillStyle = node.color;
            ctx.beginPath(); ctx.arc(rx + radarSize/2 + dx, ry + radarSize/2 + dy, 4, 0, Math.PI*2); ctx.fill();
        }
    });
    ctx.restore();
}

function update() {
    if (!document.getElementById('modeSwitch').checked) return;

    if (!isWarping) {
        let isAccelerating = false;
        if (keys.a || keys.ArrowLeft) player.angle -= player.rotationSpeed;
        if (keys.d || keys.ArrowRight) player.angle += player.rotationSpeed;
        if (keys.w || keys.ArrowUp) {
            isAccelerating = true;
            player.vx += Math.cos(player.angle) * player.acceleration;
            player.vy += Math.sin(player.angle) * player.acceleration;
        }
        if (keys.s || keys.ArrowDown) {
            player.vx -= Math.cos(player.angle) * player.acceleration;
            player.vy -= Math.sin(player.angle) * player.acceleration;
        }

        player.vx *= player.friction;
        player.vy *= player.friction;
        const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        if (speed > player.maxSpeed) {
            player.vx *= player.maxSpeed / speed;
            player.vy *= player.maxSpeed / speed;
        }

        if (engineGain) {
            if (isAccelerating) {
                engineOsc.frequency.setTargetAtTime(40 + speed * 3, audioCtx.currentTime, 0.1);
                engineGain.gain.setTargetAtTime(0.1, audioCtx.currentTime, 0.1);
            } else {
                engineOsc.frequency.setTargetAtTime(40, audioCtx.currentTime, 0.1);
                engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
            }
        }

        player.x += player.vx;
        player.y += player.vy;
        
        const margin = 2000;
        if (player.x < -margin) player.x = canvas.width + margin;
        if (player.x > canvas.width + margin) player.x = -margin;
        if (player.y < -margin) player.y = canvas.height + margin;
        if (player.y > canvas.height + margin) player.y = -margin;

        checkCollisions();

        if (combatMode) {
            // Shooting
            if (keys[' '] && Date.now() - lastShotTime > 200) {
                playSound('shoot');
                lasers.push({
                    x: player.x + Math.cos(player.angle) * 25,
                    y: player.y + Math.sin(player.angle) * 25,
                    vx: Math.cos(player.angle) * 25,
                    vy: Math.sin(player.angle) * 25,
                    life: 80
                });
                lastShotTime = Date.now();
            }

            if (Date.now() - lastEnemySpawnTime > currentSpawnInterval) {
                const spawnDist = Math.max(window.innerWidth, window.innerHeight);
                const spawnAngle = Math.random() * Math.PI * 2;
                enemies.push({
                    x: player.x + Math.cos(spawnAngle) * spawnDist,
                    y: player.y + Math.sin(spawnAngle) * spawnDist,
                    vx: 0, vy: 0,
                    speed: Math.random() * 2 + 3,
                    r: 18
                });
                lastEnemySpawnTime = Date.now();
                if (currentSpawnInterval > 500) currentSpawnInterval -= 25; 
            }

            for (let i = 0; i < enemies.length; i++) {
                for (let j = i + 1; j < enemies.length; j++) {
                    let dx = enemies[j].x - enemies[i].x;
                    let dy = enemies[j].y - enemies[i].y;
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < 40 && dist > 0) {
                        let push = (40 - dist) / 2;
                        let nx = dx / dist;
                        let ny = dy / dist;
                        enemies[i].x -= nx * push;
                        enemies[i].y -= ny * push;
                        enemies[j].x += nx * push;
                        enemies[j].y += ny * push;
                    }
                }
            }

            for (let i = lasers.length - 1; i >= 0; i--) {
                let l = lasers[i];
                l.x += l.vx; l.y += l.vy; l.life--;
                if (l.life <= 0) { lasers.splice(i, 1); continue; }
                
                let laserHit = false;
                for (let j = enemies.length - 1; j >= 0; j--) {
                    let e = enemies[j];
                    let dx1 = l.x - e.x; let dy1 = l.y - e.y;
                    let dx2 = (l.x - l.vx/2) - e.x; let dy2 = (l.y - l.vy/2) - e.y;
                    
                    if (Math.sqrt(dx1*dx1 + dy1*dy1) < e.r + 15 || Math.sqrt(dx2*dx2 + dy2*dy2) < e.r + 15) {
                        playSound('explode');
                        for(let p=0; p<10; p++) {
                            particles.push({
                                x: e.x, y: e.y,
                                vx: (Math.random()-0.5)*12, vy: (Math.random()-0.5)*12,
                                life: 25 + Math.random()*15, color: '#ef4444'
                            });
                        }
                        enemies.splice(j, 1);
                        laserHit = true;
                        score += 10;
                        updateScoreBoard();
                        break; 
                    }
                }
                if (laserHit) lasers.splice(i, 1);
            }

            for (let i = enemies.length - 1; i >= 0; i--) {
                let e = enemies[i];
                const dx = player.x - e.x;
                const dy = player.y - e.y;
                const angle = Math.atan2(dy, dx);
                e.vx = Math.cos(angle) * e.speed;
                e.vy = Math.sin(angle) * e.speed;
                e.x += e.vx; e.y += e.vy;

                if (Math.sqrt(dx*dx + dy*dy) < e.r + player.size) {
                    playSound('ram');
                    for(let p=0; p<15; p++) {
                        particles.push({
                            x: player.x, y: player.y,
                            vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15,
                            life: 30, color: '#38bdf8'
                        });
                    }
                    enemies.splice(i, 1);
                    score = 0; // RESET SCORE TO ZERO ON CRASH
                    updateScoreBoard();
                    
                    warpOverlay.style.background = 'rgba(239, 68, 68, 0.5)';
                    warpOverlay.style.opacity = '1';
                    setTimeout(() => { 
                        warpOverlay.style.opacity = '0'; 
                        setTimeout(() => warpOverlay.style.background = '#fff', 400);
                    }, 100);
                }
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.x += p.vx; p.y += p.vy; p.life--;
                if (p.life <= 0) particles.splice(i, 1);
            }
        }
    }

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        let sx = star.x - player.x * 0.2;
        let sy = star.y - player.y * 0.2;
        const w = window.innerWidth * 3;
        const h = window.innerHeight * 3;
        sx = ((sx % w) + w) % w - window.innerWidth;
        sy = ((sy % h) + h) % h - window.innerHeight;

        const speedX = isWarping ? player.vx * 3 : player.vx;
        const speedY = isWarping ? player.vy * 3 : player.vy;
        
        ctx.globalAlpha = star.alpha;
        ctx.beginPath();
        if (Math.abs(speedX) > 2 || Math.abs(speedY) > 2) {
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - speedX * 2, sy - speedY * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = star.size;
            ctx.stroke();
        } else {
            ctx.arc(sx, sy, star.size, 0, Math.PI*2);
            ctx.fill();
        }
    });
    ctx.globalAlpha = 1.0;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.translate(-player.x, -player.y);

    const currentScene = scenes[currentSceneId];
    currentScene.objects.forEach(obj => {
        if (obj.type === 'exit') drawWormhole(obj.x, obj.y, obj.r);
        else drawPlanet(obj);
    });

    if (combatMode) {
        particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / 30;
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        lasers.forEach(l => {
            ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x - l.vx, l.y - l.vy); ctx.stroke();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'; ctx.lineWidth = 8;
            ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x - l.vx, l.y - l.vy); ctx.stroke();
            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4;
        });

        enemies.forEach(e => {
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(Math.atan2(player.y - e.y, player.x - e.x));
            
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.moveTo(e.r, 0); ctx.lineTo(-e.r + 5, e.r - 2); ctx.lineTo(-e.r/2, 0); ctx.lineTo(-e.r + 5, -e.r + 2); ctx.closePath(); ctx.fill();
            
            ctx.fillStyle = '#fca5a5';
            ctx.beginPath(); ctx.arc(0, 0, e.r*0.3, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        });
    }

    drawSpaceship(player.x, player.y, player.angle);
    ctx.restore();

    drawRadar();

    animationFrameId = requestAnimationFrame(update);
}

// --- Mobile Touch Controls ---
function bindTouch(id, key) {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('touchstart', (e) => { 
        e.preventDefault(); 
        keys[key] = true; 
        if (audioCtx.state === 'suspended') audioCtx.resume();
        initEngine();
    });
    el.addEventListener('touchend', (e) => { 
        e.preventDefault(); 
        keys[key] = false; 
    });
}
bindTouch('btn-up', 'w');
bindTouch('btn-down', 's');
bindTouch('btn-left', 'a');
bindTouch('btn-right', 'd');
bindTouch('mobileShoot', ' ');

// --- Contact Form Validation ---
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById('contactName');
        const emailInput = document.getElementById('contactEmail');
        const messageInput = document.getElementById('contactMessage');
        const successMsg = document.getElementById('formSuccess');
        
        let isValid = true;
        
        // Reset valid states
        [nameInput, emailInput, messageInput].forEach(el => el.parentElement.classList.remove('invalid'));
        successMsg.style.display = 'none';
        
        if (!nameInput.value.trim()) {
            nameInput.parentElement.classList.add('invalid');
            isValid = false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value.trim())) {
            emailInput.parentElement.classList.add('invalid');
            isValid = false;
        }
        
        if (!messageInput.value.trim()) {
            messageInput.parentElement.classList.add('invalid');
            isValid = false;
        }
        
        if (isValid) {
            successMsg.style.display = 'block';
            contactForm.reset();
            setTimeout(() => { successMsg.style.display = 'none'; }, 5000);
        }
    });
}

// --- Tab Navigation Logic (ScrollSpy) ---
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Smooth Scroll on Click
tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = document.getElementById(btn.dataset.target);
        if (targetTab) {
            const yOffset = -150; // offset for sticky nav
            const y = targetTab.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    });
});

// ScrollSpy Observer
const spyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            tabBtns.forEach(btn => {
                if (btn.dataset.target === entry.target.id) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    });
}, { threshold: 0.15, rootMargin: "-100px 0px -100px 0px" });

tabContents.forEach(tab => spyObserver.observe(tab));

