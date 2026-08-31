const View3D_Chess = {
    scene: null,
    camera: null,
    renderer: null,
    raycaster: null,
    mouse: null,
    container: null,

    // State
    pieces: {}, // Map of "a1" -> THREE.Mesh
    validMoveMarkers: [],
    selectedMarker: null,

    // Config
    cellSize: 10,
    boardOffset: 0,

    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Cleanup previous if any
        this.container.innerHTML = '';
        this.container.style.zIndex = '0'; // Ensure it is interactable (above body bg)


        const width = window.innerWidth;
        const height = window.innerHeight;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x333333);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        // Higher angle for better overview (Top-down tilted)
        this.camera.position.set(0, 100, 60);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Controls - LOCKED as requested
        const controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        controls.enableRotate = false; // Disable rotation
        controls.enableZoom = true;   // Allow zoom
        controls.enablePan = false;   // Disable panning
        controls.minDistance = 50;
        controls.maxDistance = 150;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(50, 80, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Board
        this.createBoard();

        // Preload 3D Models
        this.preloadModels();

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Events
        window.addEventListener('resize', () => this.onWindowResize(), false);
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e), false);

        // Animation Loop
        this.animate();
    },

    createBoard() {
        const boardGroup = new THREE.Group();
        const geometry = new THREE.BoxGeometry(this.cellSize, 1, this.cellSize);

        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe0c0a0, roughness: 0.5 });
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 });

        this.boardOffset = (this.cellSize * 8) / 2 - (this.cellSize / 2);

        for (let x = 0; x < 8; x++) {
            for (let z = 0; z < 8; z++) {
                const isWhite = (x + z) % 2 === 0; // Standard chess coloring logic might differ
                // Chess coordinates: a1 is bottom-left (White view).
                // Let's map x (0-7) to file (a-h), z (0-7) to rank (1-8) or similar.

                const mesh = new THREE.Mesh(geometry, isWhite ? blackMat : whiteMat);
                // Adjust position so (0,0,0) is center of board
                mesh.position.set(
                    (x * this.cellSize) - this.boardOffset,
                    0,
                    (z * this.cellSize) - this.boardOffset
                );

                mesh.receiveShadow = true;

                // Store coordinate usage
                // file: x, rank: z
                // But display logic needs 2D map. 
                // Let's assume x=0 is 'a', z=7 is '1' (bottom)? 
                // Let's align with Chess.js 2D array.
                // Chess.js: board[r][c]. r=0 is rank 8. r=7 is rank 1. c=0 is 'a'.
                // So z should map to r.

                const r = z;
                const c = x;
                const file = String.fromCharCode(97 + c);
                const rank = 8 - r;
                mesh.userData = { square: file + rank };

                boardGroup.add(mesh);
            }
        }

        // Border
        const borderGeo = new THREE.BoxGeometry(this.cellSize * 8.5, 0.8, this.cellSize * 8.5);
        const borderMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.y = -0.2;
        boardGroup.add(border);

        this.scene.add(boardGroup);
    },

    // GLTF Model Cache and Loader
    modelCache: {},
    gltfLoader: null,
    modelsLoaded: false,

    // Model path mapping
    modelPaths: {
        'p': 'assets/chess/gltf/pawn.glb',
        'r': 'assets/chess/gltf/rook.glb',
        'n': 'assets/chess/gltf/knight.glb',
        'b': 'assets/chess/gltf/bishop.glb',
        'q': 'assets/chess/gltf/queen.glb',
        'k': 'assets/chess/gltf/king.glb'
    },

    // Preload all models
    async preloadModels() {
        if (!this.gltfLoader) {
            this.gltfLoader = new THREE.GLTFLoader();
        }

        const loadPromises = Object.entries(this.modelPaths).map(([type, path]) => {
            return new Promise((resolve, reject) => {
                this.gltfLoader.load(path, (gltf) => {
                    this.modelCache[type] = gltf.scene;
                    console.log(`Loaded model: ${type}`);
                    resolve();
                }, undefined, (error) => {
                    console.error(`Failed to load ${type}:`, error);
                    reject(error);
                });
            });
        });

        try {
            await Promise.all(loadPromises);
            this.modelsLoaded = true;
            console.log("All chess models loaded!");
        } catch (e) {
            console.error("Failed to load some models, falling back to procedural.");
        }
    },

    // Create piece from cached model
    createPiece(type, color) {
        // If models are loaded, use them
        if (this.modelsLoaded && this.modelCache[type]) {
            const model = this.modelCache[type].clone();

            // Apply color material
            const pieceMaterial = new THREE.MeshStandardMaterial({
                color: color === 'w' ? 0xf5f5dc : 0x2a1a0a, // Beige for white, dark brown for black
                roughness: 0.3,
                metalness: 0.1
            });

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = pieceMaterial;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Scale and position adjustment (models may need tweaking)
            const scale = this.cellSize * 0.35;
            model.scale.set(scale, scale, scale);

            // Rotate knights to face correctly
            if (type === 'n') {
                model.rotation.y = color === 'w' ? Math.PI / 2 : -Math.PI / 2;
            }

            return model;
        }

        // Fallback: Simple procedural geometry
        return this.createFallbackPiece(type, color);
    },

    // Fallback procedural piece (simplified)
    createFallbackPiece(type, color) {
        const material = new THREE.MeshStandardMaterial({
            color: color === 'w' ? 0xf5f5dc : 0x2a1a0a,
            roughness: 0.4,
            metalness: 0.1
        });

        let geometry;
        const r = this.cellSize * 0.3;

        switch (type) {
            case 'p': geometry = new THREE.CylinderGeometry(r * 0.6, r * 0.8, r * 2, 16); break;
            case 'r': geometry = new THREE.BoxGeometry(r * 1.2, r * 2.5, r * 1.2); break;
            case 'n': geometry = new THREE.ConeGeometry(r * 0.8, r * 3, 8); break;
            case 'b': geometry = new THREE.ConeGeometry(r * 0.6, r * 3.5, 16); break;
            case 'q': geometry = new THREE.SphereGeometry(r * 0.9, 16, 16); break;
            case 'k': geometry = new THREE.CylinderGeometry(r * 0.5, r * 0.8, r * 4, 16); break;
            default: geometry = new THREE.BoxGeometry(r, r * 2, r);
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        return mesh;
    },

    updateBoard(chessInstance) {
        // Clear old pieces
        Object.values(this.pieces).forEach(p => this.scene.remove(p));
        this.pieces = {};

        const board = chessInstance.board();

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const mesh = this.createPiece(piece.type, piece.color);

                    // Logic mapping: r=0 -> z=-offset, etc.
                    // We mapped mesh.position earlier:
                    // Z (Rank): r=0 maps to top (-Z in standard view?). 
                    // Let's matching renderBoard:
                    // Loop r: 0..7. 
                    // renderBoard r=0 is Rank 8. 

                    const x = (c * this.cellSize) - this.boardOffset;
                    const z = (r * this.cellSize) - this.boardOffset;

                    mesh.position.set(x, 0, z); // Y is handled inside group relatively

                    this.scene.add(mesh);
                    // Store link
                    const square = String.fromCharCode(97 + c) + (8 - r);
                    this.pieces[square] = mesh;
                    mesh.userData = { square: square };
                }
            }
        }
    },

    // Interaction
    onClick(event) {
        event.preventDefault();

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Raycast against board squares AND pieces?
        // Actually, raycast against an invisible plane at y=0 is easiest for squares
        // But we have piece meshes.

        // Simplified: Raycast against everything in scene
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            // Find first object with 'square' userdata
            let target = intersects[0].object;
            while (target.parent && !target.userData.square) {
                target = target.parent;
            }

            if (target.userData.square) {
                const sq = target.userData.square;
                console.log("3D Click:", sq);
                // Call Game Logic
                if (window.ChessGame) {
                    window.ChessGame.handleCellClick(sq);
                }
            }
        }
    },

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
};

window.View3D_Chess = View3D_Chess;
