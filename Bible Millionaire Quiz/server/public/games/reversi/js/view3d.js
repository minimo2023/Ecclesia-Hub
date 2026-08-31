const View3D = {
    scene: null,
    camera: null,
    renderer: null,
    raycaster: null,
    mouse: null,
    container: null,

    boardObject: null,
    discs: [], // Array of { mesh, row, col }
    markers: [], // Valid move markers
    animating: false,
    composer: null, // Post-Processing Composer
    envMap: null, // Procedural Environment Map for Reflections

    // Config
    cellSize: 10,
    boardPadding: 1,
    lastHoveredCell: null, // For caching Coach analysis
    cachedAnalysis: null,

    init(containerId, boardSize, onCellClick) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.boardSize = boardSize;
        this.onCellClick = onCellClick;
        // Full Window Size
        const width = window.innerWidth;
        const height = window.innerHeight;

        // 1. Scene Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a); // Darker sleek bg

        // 2. Camera
        this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);

        // Fixed Dramatic Angle - ADJUSTED FOR VISIBILITY
        const center = (boardSize * this.cellSize) / 2;

        // Previous Y was too low (center * 3.5), X/Z need adjustment to lift board visually
        // New: Higher Y (Look down more), Adjusted Z
        this.camera.position.set(center, center * 4.5, center + (this.boardSize * 2.0));
        this.camera.lookAt(center, 0, center); // Look at center of board (y=0) to center it vertically

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: "high-performance", // Force Discrete GPU
            precision: "highp" // High precision shaders
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio); // Fix "Low Quality" blur

        // Enable Physically Correct Lighting (UE4 Match)
        this.renderer.physicallyCorrectLights = true;

        this.renderer.shadowMap.enabled = true; // Shadows BACK ON
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Photorealistic Tone Mapping - Balanced Exposure
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2; // Slightly reduced from 1.6 to avoid blown-out highlights

        this.container.innerHTML = '';
        this.container.appendChild(this.renderer.domElement);

        // 4. No Orbit Controls (Fixed View)

        // 5. Lights (Enhanced Studio Setup) - High Intensity for UE4 Look
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Boosted Ambient
        this.scene.add(ambientLight);

        // Main Key Light - Warm Sun (High Intensity)
        const dirLight = new THREE.DirectionalLight(0xfff0dd, 3.0);
        dirLight.position.set(center - 30, 80, center + 30);
        dirLight.castShadow = true;
        // Optimization: Reduce shadow map size for compatibility
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.bias = -0.0001;
        dirLight.shadow.radius = 1;
        this.scene.add(dirLight);

        // Fill Light (Cool blue) - Boosted
        const fillLight = new THREE.DirectionalLight(0xccddff, 0.8);
        fillLight.position.set(center + 50, 50, center + 50);
        this.scene.add(fillLight);

        // Rim Light (Strong Backlight for silhouette and gloss)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
        rimLight.position.set(center, 20, center - 50); // Behind the board
        this.scene.add(rimLight);

        // Bottom/Front Light for Lower Cells Visibility
        const bottomLight = new THREE.SpotLight(0xffaa00, 2.0);
        bottomLight.position.set(center, 10, center + 40);
        bottomLight.lookAt(center, 0, center + 10);
        bottomLight.penumbra = 0.5;
        this.scene.add(bottomLight);

        // --- CRITICAL: Create Environment Map for Reflections ---
        this.createEnvironmentMap();

        // 6. Build Board (Procedural High Quality)
        this.buildBoard();

        // 7. Interaction
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Interact
        window.addEventListener('click', (e) => this.onClick(e), false);
        window.addEventListener('mousemove', (e) => this.onMouseMove(e), false);

        // Wheel zoom - attach to canvas for proper capture
        this.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Handle Resize Global
        window.addEventListener('resize', () => this.onWindowResize());

        // Zoom config
        this.zoomLevel = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 2.5;
        this.initialCameraPos = this.camera.position.clone();

        // Pan config (Middle mouse or Shift+Left to pan)
        this.isPanning = false;
        this.panStart = new THREE.Vector2();

        window.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
                this.isPanning = true;
                this.panStart.set(e.clientX, e.clientY);
                e.preventDefault();
            }
        });
        window.addEventListener('mouseup', () => { this.isPanning = false; });
        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                const deltaX = (e.clientX - this.panStart.x) * 0.3;
                const deltaZ = (e.clientY - this.panStart.y) * 0.3;
                this.panStart.set(e.clientX, e.clientY);
                this.camera.position.x -= deltaX;
                this.camera.position.z += deltaZ;
            }
        });

        // 8. Post-Processing Setup (UE4 Bloom)
        this.initPostProcessing();

        // 9. Loop
        this.animate();
    },

    initPostProcessing() {
        // EffectComposer caused WebGL errors on some hardware.
        // Disabling completely to favor PBR Material quality over Bloom effects.
        this.composer = null;
    },

    // Create a procedural HDR-like environment for reflections
    createEnvironmentMap() {
        // Use PMREMGenerator to create a compatible env map from a simple scene
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        // Create a simple "studio" scene for the env map
        const envScene = new THREE.Scene();

        // Gradient sky dome (warm top, cool bottom)
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x1a1a2e) },    // Dark blue-ish
                bottomColor: { value: new THREE.Color(0x0a0a0a) }, // Near black
                horizonColor: { value: new THREE.Color(0x2d2d3e) } // Subtle transition
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform vec3 horizonColor;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    vec3 color = mix(bottomColor, horizonColor, smoothstep(-0.2, 0.0, h));
                    color = mix(color, topColor, smoothstep(0.0, 0.5, h));
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        envScene.add(sky);

        // Add some bright "softbox" lights to simulate studio reflections
        const lightGeo = new THREE.PlaneGeometry(100, 50);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

        // Key light panel (above-front)
        const keyPanel = new THREE.Mesh(lightGeo, lightMat);
        keyPanel.position.set(0, 200, 200);
        keyPanel.lookAt(0, 0, 0);
        envScene.add(keyPanel);

        // Fill light panel (side)
        const fillPanel = new THREE.Mesh(lightGeo, lightMat.clone());
        fillPanel.material.color.setHex(0xccddff); // Cool blue tint
        fillPanel.position.set(-250, 100, 0);
        fillPanel.lookAt(0, 0, 0);
        envScene.add(fillPanel);

        // Generate the environment map
        const envMapRT = pmremGenerator.fromScene(envScene, 0.04);
        this.envMap = envMapRT.texture;

        // Apply to scene for global reflections
        this.scene.environment = this.envMap;

        pmremGenerator.dispose();
    },

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return; // Not visible yet

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);

        // Resize composer as well
        if (this.composer) {
            this.composer.setSize(w, h);
        }
    },

    // Skip texture loading, go straight to procedural build
    loadTexturesAndBuildBoard() {
        this.buildBoard();
    },

    clearBoard() {
        if (this.activeDiscs) {
            this.activeDiscs.forEach(disc => {
                this.scene.remove(disc.mesh);
            });
            this.activeDiscs.clear();
        }
        if (this.markers) {
            this.markers.forEach(m => this.scene.remove(m));
            this.markers = [];
        }
    },

    buildBoard() {
        // Group for easier management
        this.boardGroup = new THREE.Group();
        this.scene.add(this.boardGroup);

        const totalWidth = this.boardSize * this.cellSize + (this.boardPadding * 2);
        const centerOffset = (this.boardSize * this.cellSize) / 2;

        // --- High Fidelity Board Design ---
        const frameThickness = 2;
        const frameHeight = 1.5;

        // Material: Premium Dark Walnut with Procedural Wood Grain
        const woodTexture = this.createWoodGrainTexture();
        // Adjust UV scale prevents stretching
        woodTexture.repeat.set(1, 4); // Wood grain usually runs one way

        const frameMat = new THREE.MeshPhysicalMaterial({
            color: 0x5c4033,           // Base color (lighter to let texture show)
            map: woodTexture,          // Apply visible color pattern
            roughness: 0.25,
            roughnessMap: woodTexture,
            metalness: 0.0,
            clearcoat: 0.8,
            clearcoatRoughness: 0.1,
            envMap: this.envMap,
            envMapIntensity: 1.0
        });

        // 1. Frame Base (The heavy bottom)
        const baseGeo = new THREE.BoxGeometry(totalWidth + frameThickness * 2, frameHeight, totalWidth + frameThickness * 2);
        const base = new THREE.Mesh(baseGeo, frameMat);
        base.position.set(centerOffset, -frameHeight / 2 - 0.5, centerOffset);
        base.receiveShadow = true;
        this.boardGroup.add(base);

        // 2. The Rim (Raised edge) - 4 bars around
        const rimHeight = 0.8;
        const rimWidth = frameThickness;
        const fullLen = totalWidth + frameThickness * 2;

        // Top/Bottom bars relative to center
        // Z position needs to be carefully calculated relative to board center (centerOffset)
        const offsetFromCenter = (totalWidth / 2) + (frameThickness / 2);

        const rimGeoH = new THREE.BoxGeometry(fullLen, rimHeight, rimWidth);

        const rimTop = new THREE.Mesh(rimGeoH, frameMat);
        rimTop.position.set(centerOffset, 0, centerOffset - offsetFromCenter);
        rimTop.receiveShadow = true;
        rimTop.castShadow = true;
        this.boardGroup.add(rimTop);

        const rimBot = rimTop.clone();
        rimBot.position.set(centerOffset, 0, centerOffset + offsetFromCenter);
        this.boardGroup.add(rimBot);

        // Left/Right bars
        const rimGeoV = new THREE.BoxGeometry(rimWidth, rimHeight, totalWidth); // Inside length
        const rimLeft = new THREE.Mesh(rimGeoV, frameMat);
        rimLeft.position.set(centerOffset - offsetFromCenter, 0, centerOffset);
        rimLeft.receiveShadow = true;
        rimLeft.castShadow = true;
        this.boardGroup.add(rimLeft);

        const rimRight = rimLeft.clone();
        rimRight.position.set(centerOffset + offsetFromCenter, 0, centerOffset);
        this.boardGroup.add(rimRight);

        // 3. Felt Surface (Sunken) - Revert to Standard for Stability
        const feltTexture = this.createFeltTexture();
        feltTexture.repeat.set(4, 4); // Tiling for high freq detail

        const boardGeo = new THREE.BoxGeometry(totalWidth, 0.5, totalWidth);
        const boardMat = new THREE.MeshStandardMaterial({
            color: 0x2e8b57,          // Classic Felt Green (SeaGreen)
            map: feltTexture,         // Visible fabric pattern
            roughness: 0.9,
            roughnessMap: feltTexture,
            metalness: 0.0
        });
        const board = new THREE.Mesh(boardGeo, boardMat);
        board.position.set(centerOffset, -0.25, centerOffset);
        board.receiveShadow = true;
        this.boardGroup.add(board);

        // Grid Lines (Thin Planes) - Enhanced Visibility
        const gridHelper = new THREE.GridHelper(totalWidth, this.boardSize, 0x1a3a1a, 0x1a3a1a); // Darker lines
        gridHelper.position.set(centerOffset, 0.02, centerOffset); // Slightly higher to avoid z-fighting
        gridHelper.material.opacity = 0.8; // Much more visible (was 0.3)
        gridHelper.material.transparent = true;
        gridHelper.material.depthWrite = false;
        gridHelper.material.linewidth = 2; // Thicker lines (may not work on all WebGL)
        this.boardGroup.add(gridHelper);

        // Hit Targets
        this.hitTargets = [];
        const planeGeo = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
        const planeMat = new THREE.MeshBasicMaterial({ visible: false });

        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                const target = new THREE.Mesh(planeGeo, planeMat);
                target.rotation.x = -Math.PI / 2;
                target.position.set(
                    c * this.cellSize + this.cellSize / 2,
                    0.1,
                    r * this.cellSize + this.cellSize / 2
                );
                target.userData = { r, c };
                this.boardGroup.add(target);
                this.hitTargets.push(target);
            }
        }
    },

    updateBoard(boardState, validMoves, lastMove) {
        // Init cache if missing
        if (!this.activeDiscs) this.activeDiscs = new Map();

        // Debug: Log incoming board state summary
        // console.log("updateBoard called. BoardState has data?", boardState.some(r => r.some(c => c !== 0)));

        // 1. Sync Discs
        // Check for full reset (if board has drastically fewer discs than before? or just iterate all)
        // Safer to iterate the target state (boardState) and match against current.

        // Track which keys were visited to identify removals
        const visitedKeys = new Set();

        // Collect flips to animate sequentially
        const flipsToExecute = [];

        for (let r = 0; r < this.boardSize; r++) {
            for (let c = 0; c < this.boardSize; c++) {
                const val = boardState[r][c];
                const key = `${r},${c}`;

                if (val !== 0) {
                    visitedKeys.add(key);
                    if (!this.activeDiscs.has(key)) {
                        this.createDisc(r, c, val);
                    } else {
                        // Update color if flipped
                        const discObj = this.activeDiscs.get(key);
                        if (discObj.currentVal !== val) {
                            // Instead of flipping immediately, queue it
                            // this.flipDisc(discObj, val);
                            flipsToExecute.push({ discObj, val, r, c });
                        }
                    }
                }
            }
        }

        // Execute Flips with Stagger
        let totalAnimationTime = 0;

        if (flipsToExecute.length > 0) {
            // Sort by distance from lastMove if available
            if (lastMove) {
                flipsToExecute.sort((a, b) => {
                    const distA = Math.hypot(a.r - lastMove.row, a.c - lastMove.col);
                    const distB = Math.hypot(b.r - lastMove.row, b.c - lastMove.col);
                    return distA - distB;
                });
            }

            // Trigger anims
            const waveDelay = 100; // Fast Wave: 100ms
            flipsToExecute.forEach((item, index) => {
                const delay = index * waveDelay;
                setTimeout(() => {
                    this.flipDisc(item.discObj, item.val);
                }, delay);
            });

            // Calculate total time until last disc STARTS moving + some buffer for the flip itself
            // Flip takes roughly 0.5s to settle with lerp 0.15
            totalAnimationTime = (flipsToExecute.length * waveDelay) + 800;
        }

        // Remove discs that are no longer on the board
        // Convert Map keys to array to avoid iterator issues while deleting
        const keysToRemove = [];
        Array.from(this.activeDiscs.keys()).forEach(key => {
            if (!visitedKeys.has(key)) {
                keysToRemove.push(key);
            }
        });

        if (keysToRemove.length > 0) {
            console.log("Removing discs:", keysToRemove);
            keysToRemove.forEach(key => {
                const discObj = this.activeDiscs.get(key);
                this.scene.remove(discObj.mesh);
                this.activeDiscs.delete(key);
            });
        }

        // 2. Visualize Valid Moves
        this.updateMarkers(validMoves);

        return totalAnimationTime; // Return duration so Game controller knows when to unlock
    },



    // High-Fidelity Disc Surface Texture (2048x2048)
    createDiscTexture() {
        const size = 2048;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const center = size / 2;

        // Base Grey (Mid-tone for versatile mapping)
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);

        // 1. Radial Lathe Marks (Circular Scratches)
        // Simulate machining or molding flow
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.15; // Subtle
        for (let r = 50; r < center; r += 2 + Math.random() * 5) {
            ctx.beginPath();
            ctx.strokeStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
            ctx.arc(center, center, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 2. Micro-Scratches (Random direction)
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#aaaaaa';
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = Math.random() * 50 + 10;
            const angle = Math.random() * Math.PI * 2;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
            ctx.stroke();
        }

        // 3. Surface Imperfections (Noise)
        for (let i = 0; i < 100000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.fillStyle = Math.random() > 0.5 ? '#909090' : '#707070';
            ctx.fillRect(x, y, 2, 2);
        }

        ctx.globalAlpha = 1.0;

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // Procedural Wood Grain Texture (Ultra-High Res 2048)
    createWoodGrainTexture() {
        const size = 2048; // 4K Ready
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base color (lighter brown)
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(0, 0, size, size);

        // Wood grain lines (darker)
        ctx.strokeStyle = '#3e2714';
        ctx.lineWidth = 8; // Thicker lines for higher res

        // Layer 1: Strong Grain
        for (let i = 0; i < 200; i++) { // More lines
            ctx.beginPath();
            const startY = Math.random() * size;
            const amplitude = Math.random() * 80 + 20;
            const frequency = 0.005; // Lower freq for larger canvas
            ctx.moveTo(0, startY);
            for (let x = 0; x <= size; x += 20) {
                const y = startY + Math.sin(x * frequency) * amplitude + (Math.random() * 5);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Layer 2: Fine Detail
        ctx.strokeStyle = '#5c3a1e';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 600; i++) {
            ctx.beginPath();
            const startY = Math.random() * size;
            ctx.moveTo(0, startY);
            ctx.lineTo(size, startY + (Math.random() * 60 - 30));
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // Procedural Felt/Velvet Texture with Weave Pattern (Ultra-High Res 2048)
    createFeltTexture() {
        const size = 2048; // 4K Ready
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base Green
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(0, 0, size, size);

        // 1. Noise Layer
        for (let i = 0; i < 200000; i++) { // Massive particle count
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.fillStyle = Math.random() > 0.5 ? '#3cb371' : '#1e5b38';
            ctx.fillRect(x, y, 2, 2); // Slightly larger pixels
        }

        // 2. Weave Pattern (Cross-hatching)
        ctx.strokeStyle = '#257045';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25; // Subtle

        // Vertical lines
        for (let x = 0; x < size; x += 4) { // Denser lines
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y < size; y += 4) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createDisc(r, c, val) {
        // Reversi Disc: Group of 2 Halves (Stable & Visible)
        const radius = (this.cellSize * 0.42);
        const thickness = 0.6; // Total thickness

        if (!this.coinGeometry) {
            const shape = new THREE.Shape();
            shape.absarc(0, 0, radius, 0, Math.PI * 2, false);

            this.coinGeometry = new THREE.ExtrudeGeometry(shape, {
                depth: thickness / 2,
                bevelEnabled: true,
                bevelThickness: 0.1,
                bevelSize: 0.1,
                bevelSegments: 8
            });
        }

        // Lazy load texture
        if (!this.discTexture) {
            this.discTexture = this.createDiscTexture();
        }

        // Materials - High-End PBR (Stable Config)
        // Black: Obsidian-like (Glossy, Clearcoat)
        const matBlack = new THREE.MeshPhysicalMaterial({
            color: 0x0a0a0a,
            map: this.discTexture,     // Subtle albedo detail
            roughness: 0.2,
            roughnessMap: this.discTexture,
            bumpMap: this.discTexture,
            bumpScale: 0.01,
            metalness: 0.0,
            clearcoat: 1.0,           // STABLE: Clearcoat is widely supported
            clearcoatRoughness: 0.1,
            reflectivity: 1.0,
            envMap: this.envMap,
            envMapIntensity: 2.5      // Strong reflections to compensate for darkness
        });

        // White: Bone China / Porcelain (Simulated Subsurface via color/roughness)
        const matWhite = new THREE.MeshPhysicalMaterial({
            color: 0xfffaf0,          // Warm white
            map: this.discTexture,    // Subtle albedo detail
            roughness: 0.25,
            roughnessMap: this.discTexture,
            bumpMap: this.discTexture,
            bumpScale: 0.005,
            metalness: 0.0,
            clearcoat: 0.8,
            clearcoatRoughness: 0.1,
            reflectivity: 0.8,
            envMap: this.envMap,
            envMapIntensity: 1.5
            // SKIPPED: transmission, sheen (Unstable on some WebGL2 contexts)
        });

        const discGroup = new THREE.Group();

        // Z-Fighting Prevention
        const epsilon = 0.005;

        // Top Half (Black)
        const blackHalf = new THREE.Mesh(this.coinGeometry, matBlack);
        blackHalf.rotation.x = -Math.PI / 2;
        blackHalf.position.y = epsilon;

        // Bottom Half (White)
        const whiteHalf = new THREE.Mesh(this.coinGeometry, matWhite);
        whiteHalf.rotation.x = Math.PI / 2;
        whiteHalf.position.y = -epsilon;

        discGroup.add(blackHalf);
        discGroup.add(whiteHalf);

        discGroup.castShadow = true;
        discGroup.receiveShadow = true;

        discGroup.position.set(
            c * this.cellSize + this.cellSize / 2,
            0.65,
            r * this.cellSize + this.cellSize / 2
        );

        // Lift base
        discGroup.position.y = 0.95;

        // State Tracking (Base orientation is Black Up)
        const baseRotX = 0;

        let initialRot = baseRotX;
        if (val === 2) { // White
            initialRot = Math.PI;
        }

        discGroup.rotation.x = initialRot;

        const discObj = { mesh: discGroup, currentVal: val, targetRotX: initialRot };

        // Sound & Anim
        if (typeof SoundManager !== 'undefined') SoundManager.playSound('move');

        const finalY = discGroup.position.y;
        discGroup.position.y = 8;
        gsapTo(discGroup.position, { y: finalY, duration: 0.5, ease: 'bounce' });

        this.scene.add(discGroup);
        this.activeDiscs.set(`${r},${c}`, discObj);
    },

    flipDisc(discObj, newVal) {
        if (discObj.currentVal === newVal) return;
        discObj.currentVal = newVal;

        // Continuous rotation: Always add PI
        discObj.targetRotX += Math.PI;

        // Sound Effect
        if (typeof SoundManager !== 'undefined') SoundManager.playSound('flip');
    },

    updateMarkers(validMoves) {
        // Clear old
        if (!this.markers) this.markers = [];
        this.markers.forEach(m => this.scene.remove(m));
        this.markers = [];

        const geo = new THREE.SphereGeometry(1, 16, 16);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            emissive: 0x00aa00
        });

        validMoves.forEach(m => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
                m.col * this.cellSize + this.cellSize / 2,
                0.5,
                m.row * this.cellSize + this.cellSize / 2
            );
            mesh.userData = { isMarker: true }; // Ignore raycast? or use as guide
            this.scene.add(mesh);
            this.markers.push(mesh);
        });

        // Also update danger zones if in Learning Mode
        if (window.gameState && window.gameState.board) {
            this.showDangerZones(window.gameState.board);
        }
    },

    // NEW: Visual Danger Zone Markers for Learning Mode
    showDangerZones(board) {
        // Clear old danger markers
        if (!this.dangerMarkers) this.dangerMarkers = [];
        this.dangerMarkers.forEach(m => this.scene.remove(m));
        this.dangerMarkers = [];

        // Only show in Learning Mode
        if (!window.gameState || !window.gameState.isLearningMode) return;

        const size = board.length;
        const corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];

        // Collect C/X squares for each untaken corner
        const dangerCells = [];

        corners.forEach(([cr, cc]) => {
            if (board[cr][cc] !== 0) return; // Corner already taken, safe

            // X-Square (diagonal)
            const xr = cr === 0 ? 1 : size - 2;
            const xc = cc === 0 ? 1 : size - 2;
            if (board[xr][xc] === 0) dangerCells.push({ row: xr, col: xc, type: 'x' });

            // C-Squares (orthogonal)
            const c1r = cr;
            const c1c = cc === 0 ? 1 : size - 2;
            const c2r = cr === 0 ? 1 : size - 2;
            const c2c = cc;
            if (board[c1r][c1c] === 0) dangerCells.push({ row: c1r, col: c1c, type: 'c' });
            if (board[c2r][c2c] === 0) dangerCells.push({ row: c2r, col: c2c, type: 'c' });
        });

        // Create visual markers
        const geo = new THREE.RingGeometry(3, 4, 32);

        dangerCells.forEach(cell => {
            const color = cell.type === 'x' ? 0xff3300 : 0xff9900; // X = Red, C = Orange
            const mat = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2; // Lay flat
            mesh.position.set(
                cell.col * this.cellSize + this.cellSize / 2,
                0.15, // Just above board
                cell.row * this.cellSize + this.cellSize / 2
            );
            mesh.userData = { isDangerMarker: true };
            this.scene.add(mesh);
            this.dangerMarkers.push(mesh);
        });
    },

    // Visual highlight for Coach's suggested move
    showSuggestionHighlight(row, col) {
        this.clearSuggestionHighlight();

        const geo = new THREE.RingGeometry(2.5, 4, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00ff88, // Bright green
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(
            col * this.cellSize + this.cellSize / 2,
            0.2,
            row * this.cellSize + this.cellSize / 2
        );
        mesh.userData = { isSuggestionMarker: true };
        this.scene.add(mesh);
        this.suggestionMarker = mesh;

        // Pulsing animation
        this.suggestionPulse = { mesh, time: 0 };
    },

    clearSuggestionHighlight() {
        if (this.suggestionMarker) {
            this.scene.remove(this.suggestionMarker);
            this.suggestionMarker = null;
        }
        this.suggestionPulse = null;
    },

    onClick(event) {
        if (!this.onCellClick) return;

        // Calculate normalized device coordinates (NDC)
        // -1 to +1
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Debug logging
        // console.log("Click NDC:", this.mouse.x.toFixed(2), this.mouse.y.toFixed(2));

        // Raycast against Invisible Hit Targets
        const intersects = this.raycaster.intersectObjects(this.hitTargets);

        // Console Debug
        console.log(`Click (${this.mouse.x.toFixed(2)}, ${this.mouse.y.toFixed(2)}). Hit: ${intersects.length}`);

        if (intersects.length > 0) {
            // console.log("Hit Cell:", intersects[0].object.userData);
            const data = intersects[0].object.userData;
            console.log("Hit Cell:", data);
            this.onCellClick(data.r, data.c);
        } else {
            // console.log("No Hit. Targets count:", this.hitTargets.length);
        }
    },

    onMouseMove(event) {
        // Calculate Mouse NDC
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Visual Cursor Feedback
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.hitTargets);

        if (intersects.length > 0) {
            document.body.style.cursor = 'pointer';

            const data = intersects[0].object.userData;
            // Coach Mode: Ghost Disc & Prediction
            this.updateGhostDisc(data.r, data.c);

        } else {
            document.body.style.cursor = 'default';
            if (this.ghostDisc) this.ghostDisc.visible = false;
        }
    },

    // Mouse Wheel Zoom
    onWheel(event) {
        event.preventDefault();

        const zoomSpeed = 0.1;
        const delta = event.deltaY > 0 ? 1 : -1;

        this.zoomLevel += delta * zoomSpeed;
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel));

        // Apply zoom by moving camera closer/farther
        if (this.initialCameraPos) {
            const center = (this.boardSize * this.cellSize) / 2;
            const direction = new THREE.Vector3().subVectors(this.initialCameraPos, new THREE.Vector3(center, 0, center)).normalize();
            const distance = this.initialCameraPos.distanceTo(new THREE.Vector3(center, 0, center));
            const newDistance = distance / this.zoomLevel;

            this.camera.position.copy(new THREE.Vector3(center, 0, center)).add(direction.multiplyScalar(newDistance));
            this.camera.lookAt(center, 0, center);
        }
    },

    // Ghost Disc for Coach Mode
    createGhostDisc() {
        if (this.ghostDisc) return;

        const radius = (this.cellSize * 0.42);
        const thickness = 0.2;
        const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00, // Default green, will override
            transparent: true,
            opacity: 0.5,
            wireframe: false
        });

        this.ghostDisc = new THREE.Mesh(geometry, material);
        this.ghostDisc.visible = false;
        this.boardGroup.add(this.ghostDisc);
    },

    updateGhostDisc(r, c) {
        // Debug
        // console.log("Ghost update:", r, c, window.gameState?.isLearningMode);

        if (typeof window.gameState === 'undefined' || !window.gameState.isLearningMode) {
            if (this.ghostDisc) this.ghostDisc.visible = false;
            return;
        }

        if (typeof ReversiRules === 'undefined') return;

        // Check if move is valid
        const isValid = ReversiRules.isValidMove(window.gameState.board, r, c, window.gameState.currentPlayer);

        // 3. Which move is "Best" (AI selection)

        const gs = window.gameState;
        const isLearningMode = (gs && gs.isLearningMode);
        let bestMove = null;
        let weights = null;

        if (isLearningMode && typeof AI !== 'undefined' && gs) {
            // Get Static Weights for Quick "Bad Move" Detection
            weights = AI.getWeights(this.boardSize);

            // Get AI Recommendation (Depth 2 is fast enough for UI hint)
            bestMove = AI.getBestMove(gs.board, gs.currentPlayer, 'normal');
        } if (isValid) {
            // Lazy create
            if (!this.ghostDisc) this.createGhostDisc();

            const x = c * this.cellSize + this.cellSize / 2;
            const z = r * this.cellSize + this.cellSize / 2;

            this.ghostDisc.position.set(x, 0.6, z); // Slightly above board
            this.ghostDisc.visible = true;
            document.body.style.cursor = 'pointer';

            // Set Color based on player
            const isBlack = window.gameState.currentPlayer === 1;
            this.ghostDisc.material.color.setHex(isBlack ? 0x000000 : 0xffffff);
            this.ghostDisc.material.opacity = 0.5;

            // COACH COMMENTARY UPDATE - with caching to avoid repeated calls
            if (typeof Coach !== 'undefined' && window.gameState.isLearningMode) {
                const hud = document.getElementById('coachHud');
                const text = document.getElementById('coachText');

                // Only re-analyze if hovered cell changed
                const cellKey = `${r}-${c}`;
                if (this.lastHoveredCell !== cellKey) {
                    this.lastHoveredCell = cellKey;
                    // Use Reasoning-based analysis (Knowledge Base)
                    if (Coach.analyzeWithReasoning) {
                        this.cachedAnalysis = Coach.analyzeWithReasoning(window.gameState.board, window.gameState.currentPlayer, { row: r, col: c });
                    } else {
                        this.cachedAnalysis = Coach.analyzeMove(window.gameState.board, window.gameState.currentPlayer, { row: r, col: c });
                    }

                    // Visual: Highlight suggested move if different
                    this.clearSuggestionHighlight();
                    if (this.cachedAnalysis.suggestedMove) {
                        this.showSuggestionHighlight(this.cachedAnalysis.suggestedMove.row, this.cachedAnalysis.suggestedMove.col);
                    }
                }

                if (hud && text && this.cachedAnalysis) {
                    hud.style.display = 'flex'; // Show if hidden
                    // Render with line breaks
                    text.innerHTML = this.cachedAnalysis.text.replace(/\n/g, '<br>');

                    // Reset classes
                    hud.classList.remove('good', 'warning');
                    if (this.cachedAnalysis.type === 'good') hud.classList.add('good');
                    if (this.cachedAnalysis.type === 'warning') hud.classList.add('warning');
                }
            }

        } else {
            if (this.ghostDisc) this.ghostDisc.visible = false;
            document.body.style.cursor = 'default';

            // Hide HUD or reset text when not hovering valid move?
            // Maybe keep the last message or say "Waiting..."
            if (window.gameState && window.gameState.isLearningMode) {
                const hud = document.getElementById('coachHud');
                const text = document.getElementById('coachText');
                if (hud) {
                    hud.classList.remove('good', 'warning');
                    // text.textContent = "移動滑鼠至合法位置...";
                }
            }
        }
    },

    animate() {
        requestAnimationFrame(() => this.animate());

        // Anim logic
        if (this.activeDiscs) {
            this.activeDiscs.forEach(disc => {
                // Lerp rotation - Balanced Speed (0.06)
                if (Math.abs(disc.mesh.rotation.x - disc.targetRotX) > 0.01) {
                    disc.mesh.rotation.x += (disc.targetRotX - disc.mesh.rotation.x) * 0.06;

                    // Jump effect during flip
                    // Updated: High Lift Animation (Leaving the board significantly)
                    const jumpHeight = 6.0;
                    const jumpY = Math.abs(Math.sin(disc.mesh.rotation.x)) * jumpHeight;

                    disc.mesh.position.y = 0.95 + jumpY;

                    // Add subtle wobble on Z axis when in air
                    const wobble = Math.sin(disc.mesh.rotation.x * 2) * 0.2;
                    disc.mesh.rotation.z = wobble;

                } else {
                    disc.mesh.position.y = 0.95; // Rest height
                    disc.mesh.rotation.x = disc.targetRotX; // Snap to target
                    disc.mesh.rotation.z = 0; // Reset wobble
                }
            });
        }

        // Marker Pulse
        const time = Date.now() * 0.003;
        this.markers.forEach(m => {
            m.scale.setScalar(0.8 + Math.sin(time) * 0.2);
        });

        // Use Composer for Post-Processed Render (Bloom)
        // Composer Disabled for stability (WebGL errors on some clients)
        if (this.composer && false) { // Forced disable
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
};

// Simple GSAP-like helper
function gsapTo(obj, props) {
    // Naive one-shot impl for setup spawn
    const startY = obj.y;
    const endY = props.y;
    const startTime = Date.now();
    const duration = props.duration * 1000;

    function step() {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        // Bounce ease out
        // simplified
        obj.y = startY + (endY - startY) * progress;

        if (progress < 1) requestAnimationFrame(step);
    }
    step();
}
