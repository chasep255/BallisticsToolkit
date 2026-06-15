// Interactive gyroscopic-effects demo for the "Spin corrections" section.
//
// A slowly spinning, rifled bullet that the reader can poke at, in two modes:
//
//   Crosswind jump - a crosswind pushes on the centre of pressure (ahead of the
//     centre of mass), so the lever yaws the nose sideways; the spin then
//     precesses that yaw a quarter-turn into a vertical jump. Right twist + wind
//     from the right -> strikes HIGH; left strikes low; flipping the twist flips it.
//
//   Spin drift - gravity (acting at the centre of mass, with no lever of its own)
//     bends the trajectory downward. The spinning axis lags the bending path, so
//     the nose rides slightly ABOVE the path: a small angle of attack. The air now
//     pushes on the centre of pressure, and the spin precesses that a quarter-turn
//     into a steady sideways lean (the yaw of repose), which drifts the bullet to
//     the side (right for a right-hand twist).
//
// It is a GUIDED ILLUSTRATION, not a physics integration: the motions are scripted
// so the directions stay legible and match the engine's conventions.
//
// No WASM is needed, so the demo runs even when the ballistics core fails to load.
// If Three.js itself is unavailable (offline), the figure removes itself.

let THREE, OrbitControls;
try
{
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
}
catch (e)
{
    THREE = null;
}

const D2R = Math.PI / 180;

const root = document.getElementById('spinDemo');
const canvas = root && document.getElementById('spinCanvas');
if (root && canvas)
{
    if (THREE) initSpinDemo();
    else root.style.display = 'none'; // Three.js unavailable: drop the interactive, keep the static figures
}

function initSpinDemo()
{
    const labelLayer = document.getElementById('spinLabels');
    const caption = document.getElementById('spinCaption');

    // ---- scene, camera, renderer -------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(34, 2, 0.1, 100);
    camera.position.set(3.8, 2.5, 7.6); // behind, above and to the right: we look downrange

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 14;
    controls.minPolarAngle = 22 * D2R;
    controls.maxPolarAngle = 152 * D2R;
    controls.target.set(0, 0, 0);

    // ---- lighting -----------------------------------------------------------
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 6, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xeaf0f6, 0.5);
    fill.position.set(-5, 1, -3);
    scene.add(fill);

    // ---- the bullet ---------------------------------------------------------
    const LEN = 4.0, RAD = 1.55; // axial length and diameter scale of the model
    const COP_Z = -LEN * 0.30;   // centre of pressure: ahead of the centre of mass (origin)

    // Boat-tail spitzer profile, tail -> tip, as (radius, axial) in [0,1].
    const profile = [
        [0.00, 0.00], [0.32, 0.00], [0.40, 0.05], [0.50, 0.16],
        [0.50, 0.52], [0.47, 0.60], [0.36, 0.74], [0.22, 0.88],
        [0.10, 0.96], [0.00, 1.00]
    ];
    const pts = profile.map(p => new THREE.Vector2(p[0] * RAD, p[1] * LEN - LEN / 2));
    const bulletGeo = new THREE.LatheGeometry(pts, 64);
    bulletGeo.rotateX(-Math.PI / 2); // long axis -> Z, tip toward -Z (downrange)

    const bulletMat = new THREE.MeshStandardMaterial({ color: 0xb5824a, metalness: 0.55, roughness: 0.42 });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);

    // Rifling is engraved only on the cylindrical bearing surface (the shaft), not
    // the ogive or boat-tail: a separate grooved band wrapping the full-diameter run.
    const riflingTex = makeRiflingTexture();
    const BAND_R = 0.50 * RAD, BAND_LO = 0.16, BAND_HI = 0.52;
    const bandLen = (BAND_HI - BAND_LO) * LEN;
    const bandZ = LEN / 2 - (BAND_LO + BAND_HI) / 2 * LEN; // axial -> Z: z = LEN/2 - a*LEN
    const bandGeo = new THREE.CylinderGeometry(BAND_R * 1.006, BAND_R * 1.006, bandLen, 64, 1, true);
    bandGeo.rotateX(Math.PI / 2);
    const riflingBand = new THREE.Mesh(bandGeo,
        new THREE.MeshStandardMaterial({ map: riflingTex, metalness: 0.55, roughness: 0.42 }));
    riflingBand.position.z = bandZ;

    // spinner spins about the long axis (local Z); bulletGroup carries the orientation.
    const spinner = new THREE.Group();
    spinner.add(bullet, riflingBand);
    const bulletGroup = new THREE.Group();
    bulletGroup.add(spinner);
    scene.add(bulletGroup);

    // ---- shared reference geometry -----------------------------------------
    const gnomon = new THREE.Group(); // a small right/up axis pair, parked lower-left
    gnomon.position.set(-3.1, -1.8, 1.6);
    gnomon.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.9, 0x2c3e50, 0.24, 0.16));
    gnomon.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.9, 0x2c3e50, 0.24, 0.16));
    scene.add(gnomon);

    // spin axis (angular momentum L): updated each frame to follow the nose
    const spinAxisArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, LEN / 2),
        LEN + 1.5, 0x34495e, 0.34, 0.2);
    scene.add(spinAxisArrow);

    // centre of mass / centre of pressure / lever: used by BOTH effects
    const dotMat = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false });
    const comDot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), dotMat(0x2c3e50));
    const copDot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), dotMat(0xb06a16));
    copDot.position.z = COP_Z;
    comDot.renderOrder = copDot.renderOrder = 10;
    const leverLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, COP_Z)]),
        new THREE.LineBasicMaterial({ color: 0xb06a16, depthTest: false }));
    leverLine.renderOrder = 9;
    const pivotGroup = new THREE.Group();
    pivotGroup.add(comDot, copDot, leverLine);
    scene.add(pivotGroup);

    // ---- crosswind-jump group ----------------------------------------------
    // straight line of flight, used as the reference in jump mode
    const flightLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 2.6), new THREE.Vector3(0, 0, -3.0)]),
        new THREE.LineDashedMaterial({ color: 0xb8c2cc, dashSize: 0.18, gapSize: 0.14 }));
    flightLine.computeLineDistances();
    flightLine.visible = false;
    scene.add(flightLine);

    const windArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1.75, 0), 2.0, 0x16a085, 0.3, 0.2);
    const forceArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, COP_Z), 1.25, 0x16a085, 0.28, 0.18);
    const jumpArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -LEN / 2), 1.6, 0xe74c3c, 0.3, 0.2);
    let turnArc = null; // purple: the 90-degree gyroscopic redirect into the jump
    const windGroup = new THREE.Group();
    windGroup.add(windArrow, forceArrow, jumpArrow);
    windGroup.visible = false;
    scene.add(windGroup);

    // ---- spin-drift group ---------------------------------------------------
    // the trajectory, bent downward by gravity (a parabola through the origin)
    const trajPts = [];
    for (let t = -1.6; t <= 3.8; t += 0.15)
        trajPts.push(new THREE.Vector3(0, -0.18 * t - 0.05 * t * t, -t));
    const trajLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trajPts),
        new THREE.LineBasicMaterial({ color: 0x9aa7b2 }));
    const VEL_DIR = new THREE.Vector3(0, -0.18, -1).normalize(); // path tangent at the muzzle
    const velArrow = new THREE.ArrowHelper(VEL_DIR, new THREE.Vector3(0, 0, 0), 2.4, 0x16a085, 0.3, 0.2);
    const gravArrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 0), 1.5, 0x2980b9, 0.3, 0.2);
    const driftArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1.7, 0), 1.4, 0xc0398b, 0.3, 0.2);
    let aoaArc = null; // amber: the angle of attack between the path and the nose
    const driftGroup = new THREE.Group();
    driftGroup.add(trajLine, velArrow, gravArrow, driftArrow);
    driftGroup.visible = false;
    scene.add(driftGroup);

    // ---- floating HTML labels ----------------------------------------------
    const labels = [];
    function mkLabel(text, color)
    {
        const el = document.createElement('div');
        el.className = 'spin-lab';
        el.textContent = text;
        el.style.color = color;
        labelLayer.appendChild(el);
        const rec = { el, anchor: null, text };
        labels.push(rec);
        return rec;
    }
    const labL = mkLabel('spin axis L', '#34495e');
    const labX = mkLabel('right', '#2c3e50');
    const labY = mkLabel('up', '#2c3e50');
    const labCom = mkLabel('centre of mass', '#2c3e50');
    const labCop = mkLabel('centre of pressure', '#b06a16');
    // jump-only
    const labFlight = mkLabel('line of flight', '#8a939c');
    const labWind = mkLabel('crosswind', '#0f8a73');
    const labYaw = mkLabel('yaws the nose', '#b06a16');
    const labJump = mkLabel('jumps HIGH', '#c0392b');
    // drift-only
    const labVel = mkLabel('velocity (along the path)', '#0f8a73');
    const labGrav = mkLabel('gravity (at the centre of mass)', '#2061a8');
    const labAoa = mkLabel('nose rides above the path', '#b06a16');
    const labDrift = mkLabel('spin drift', '#9c2d77');
    const labTraj = mkLabel('trajectory (bent by gravity)', '#7d8a96');

    // ---- state --------------------------------------------------------------
    const st = {
        mode: 'jump',       // 'jump' crosswind jump, 'drift' spin drift
        twist: 'R',         // 'R' right-hand, 'L' left-hand (selected)
        wind: 'R',          // 'L', '0', 'R' (selected)
        shownWind: 'R',     // direction currently played out (lags selection during a swap)
        shownTwist: 'R',    // twist currently played out for the pose
        windP: 0,           // 0..1 progress of the one-time crosswind response (plays once, then holds)
        pushX: -1,          // sideways direction the wind pushes the nose
        js: 1,              // jump sign: +1 up (HIGH), -1 down (LOW)
        driftP: 0,          // eased 0..1 progress of the spin-drift lean
        showVectors: true
    };
    const YAW_RAD = 13 * D2R;       // how far the nose visibly yaws under the crosswind
    const JUMP_RAD = 12 * D2R;      // how far it ends up tipped vertically (the jump)
    const NOSE_UP_RAD = 7 * D2R;    // how far the nose rides above the path (drift mode)
    const DRIFT_YAW_RAD = 9 * D2R;  // the steady sideways lean (yaw of repose)

    // HIGH for (right twist + wind right) or (left twist + wind left); else LOW.
    function jumpSign()
    {
        if (st.wind === '0') return 0;
        return (st.twist === 'R' ? 1 : -1) * (st.wind === 'R' ? 1 : -1);
    }
    const driftSide = () => (st.twist === 'R' ? 1 : -1); // +1 nose/drift to the right

    function applyState()
    {
        const jump = st.mode === 'jump';
        const windOn = jump && st.wind !== '0';
        const sv = st.showVectors;

        flightLine.visible = sv && jump;
        windGroup.visible = sv && jump && windOn;
        driftGroup.visible = sv && !jump;
        pivotGroup.visible = sv;
        spinAxisArrow.visible = sv;
        gnomon.visible = sv;
        riflingTex.repeat.x = st.twist === 'R' ? 1 : -1; // reverse the helix for LH

        // gray out the crosswind buttons when they do not apply (drift mode)
        root.querySelectorAll('[data-wind]').forEach(b => { b.disabled = !jump; });

        // Keep the shown vectors in sync only when no pose change is pending. A change
        // (wind L<->R, or twist) is animated by the frame loop: the nose first retracts
        // to neutral, then swings out the new way, instead of snapping across.
        if (jump && st.wind === st.shownWind && st.twist === st.shownTwist && st.wind !== '0') refreshWind();
        if (!jump) rebuildAoaArc();
        updateCaption();
    }

    function refreshWind()
    {
        const wdir = st.shownWind === 'R' ? -1 : 1; // wind from the right travels toward -x
        const js = (st.shownTwist === 'R' ? 1 : -1) * (st.shownWind === 'R' ? 1 : -1);
        st.pushX = wdir;
        st.js = js;
        windArrow.setDirection(new THREE.Vector3(wdir, 0, 0));
        forceArrow.setDirection(new THREE.Vector3(wdir, 0, 0));
        jumpArrow.setDirection(new THREE.Vector3(0, js, 0));
        labJump.text = js > 0 ? 'jumps HIGH' : 'jumps LOW';
        labJump.el.textContent = labJump.text;
        // purple 90-degree arc at the nose: push (sideways) -> jump (vertical)
        rebuildTurnArc(new THREE.Vector3(wdir, 0, 0), new THREE.Vector3(0, js, 0));
    }

    function rebuildTurnArc(u, v)
    {
        if (turnArc) { windGroup.remove(turnArc); turnArc.traverse(o => o.geometry && o.geometry.dispose()); }
        turnArc = makeArc(u, v, 0.95, 0, Math.PI / 2, 0x6f42c1, true);
        turnArc.position.set(0, 0, -LEN / 2);
        windGroup.add(turnArc);
    }

    function rebuildAoaArc()
    {
        if (aoaArc) { driftGroup.remove(aoaArc); aoaArc.traverse(o => o.geometry && o.geometry.dispose()); }
        // nose direction at the settled yaw-of-repose pose
        const e = new THREE.Euler(NOSE_UP_RAD, -driftSide() * DRIFT_YAW_RAD, 0, 'YXZ');
        const nose = new THREE.Vector3(0, 0, -1).applyEuler(e);
        const v = nose.clone().addScaledVector(VEL_DIR, -nose.dot(VEL_DIR)).normalize(); // perp to VEL in their plane
        const ang = Math.acos(Math.max(-1, Math.min(1, nose.dot(VEL_DIR))));
        aoaArc = makeArc(VEL_DIR.clone(), v, 0.95, 0, ang, 0xb06a16, true);
        driftGroup.add(aoaArc);
    }

    function updateCaption()
    {
        const hand = st.twist === 'R' ? 'Right-hand twist' : 'Left-hand twist';
        if (st.mode === 'drift')
        {
            const side = driftSide() > 0 ? 'right' : 'left';
            caption.innerHTML = `${hand}: gravity bends the path downward, but the spinning axis lags, so the nose rides slightly above the path. The air pushes on the centre of pressure, and the spin precesses that a quarter-turn into a steady lean, drifting the bullet to the <strong>${side}</strong> (spin drift). Gravity itself acts at the centre of mass, with no lever of its own.`;
            return;
        }
        if (st.wind === '0')
        {
            caption.innerHTML = `${hand}. The bullet spins about its long axis (the angular-momentum vector <strong>L</strong>). Apply a crosswind to see the crosswind jump. Drag to orbit.`;
            return;
        }
        const from = st.wind === 'R' ? 'right' : 'left';
        const hl = jumpSign() > 0 ? 'HIGH' : 'LOW';
        caption.innerHTML = `${hand}: the crosswind from the ${from} pushes on the centre of pressure, ahead of the centre of mass, so it yaws the nose sideways. The spin then precesses that yaw a quarter-turn into the vertical, so the strike jumps <strong>${hl}</strong> (crosswind jump).`;
    }

    // ---- controls wiring ----------------------------------------------------
    function setActive(val, attr)
    {
        root.querySelectorAll(`[${attr}]`).forEach(b => b.classList.toggle('is-on', b.getAttribute(attr) === val));
    }
    function bind(attr, set)
    {
        root.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () =>
        {
            if (b.disabled) return;
            set(b.getAttribute(attr));
            setActive(b.getAttribute(attr), attr);
            applyState();
        }));
    }
    bind('data-mode', v => { st.mode = v; });
    bind('data-twist', v => { st.twist = v; });
    bind('data-wind', v => { st.wind = v; });
    const vecToggle = document.getElementById('spinVectors');
    if (vecToggle) vecToggle.addEventListener('change', () => { st.showVectors = vecToggle.checked; applyState(); });

    // ---- animation loop -----------------------------------------------------
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    if ('IntersectionObserver' in window)
        new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);

    const tmp = new THREE.Vector3();
    let last = 0;
    const approach = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, dt * rate);

    function resize()
    {
        const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
        if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr))
        {
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        }
    }

    function projectLabel(rec, w, h)
    {
        if (!rec.anchor) { rec.el.style.display = 'none'; return; }
        tmp.copy(rec.anchor).project(camera);
        if (tmp.z > 1) { rec.el.style.display = 'none'; return; }
        rec.el.style.display = 'block';
        rec.el.style.left = ((tmp.x * 0.5 + 0.5) * w) + 'px';
        rec.el.style.top = ((-tmp.y * 0.5 + 0.5) * h) + 'px';
    }

    // crosswind pose from the progress p in [0,1]: first yaw out toward the push,
    // then precess most of the way up to the jump (stopping short of fully vertical
    // so a little yaw of repose stays visible at rest).
    function jumpPose(p)
    {
        const yawPhase = Math.min(1, p / 0.4);
        const precPhase = Math.max(0, Math.min(1, (p - 0.4) / 0.6));
        const phi = (Math.PI / 2) * 0.72 * precPhase;
        return {
            pitch: st.js * JUMP_RAD * precPhase * Math.sin(phi),    // the vertical jump
            yaw: -st.pushX * YAW_RAD * yawPhase * Math.cos(phi)     // sideways toward the push
        };
    }

    function frame(ts)
    {
        const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
        last = ts;

        if (visible)
        {
            const jump = st.mode === 'jump';
            st.driftP = approach(st.driftP, jump ? 0 : 1, 2.5, dt);

            if (jump)
            {
                // A pose change (wind L<->R, or twist) plays out instead of snapping: first
                // retract the nose to neutral, then adopt the new direction and swing out.
                const poseChanged = (st.wind !== st.shownWind) || (st.twist !== st.shownTwist);
                const tgt = poseChanged ? 0 : (st.shownWind !== '0' ? 1 : 0);
                if (reduce) st.windP = poseChanged ? 0 : tgt;
                else st.windP += Math.sign(tgt - st.windP) * Math.min(Math.abs(tgt - st.windP), dt * 0.42);
                if (poseChanged && st.windP <= 0.01)
                {
                    st.shownWind = st.wind;
                    st.shownTwist = st.twist;
                    if (st.shownWind !== '0') refreshWind();
                }
                const pose = jumpPose(st.windP);
                bulletGroup.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
            }
            else
            {
                // settle into the yaw of repose: nose tipped up and leaned to the side
                bulletGroup.rotation.set(NOSE_UP_RAD * st.driftP, -driftSide() * DRIFT_YAW_RAD * st.driftP, 0, 'YXZ');
            }

            // visible spin: right-hand twist reads clockwise from behind (-Z rotation)
            if (!reduce) spinner.rotation.z += (st.twist === 'R' ? -1 : 1) * dt * 2.6;

            // spin axis L: angular momentum points forward for a right-hand twist, out
            // the rear for a left-hand twist (the spin sense reverses).
            const fwd = tmp.set(0, 0, -1).applyEuler(bulletGroup.rotation).clone();
            const lAxis = st.twist === 'R' ? fwd : fwd.clone().negate();
            spinAxisArrow.setDirection(lAxis);
            spinAxisArrow.position.copy(lAxis).multiplyScalar(-LEN / 2);

            controls.update();
            resize();
            placeLabels(lAxis);

            const w = canvas.clientWidth, h = canvas.clientHeight;
            for (const rec of labels) projectLabel(rec, w, h);

            renderer.render(scene, camera);
        }
        requestAnimationFrame(frame);
    }

    function placeLabels(lAxis)
    {
        const sv = st.showVectors, jump = st.mode === 'jump';
        const wOn = windGroup.visible;
        const wdir = st.pushX;   // the direction currently shown (lags the selection during a swap)
        const ds = driftSide();

        labL.anchor = sv ? lAxis.clone().multiplyScalar(LEN / 2 + 1.5) : null;
        labX.anchor = sv ? new THREE.Vector3(-2.2, -1.8, 1.6) : null;
        labY.anchor = sv ? new THREE.Vector3(-3.1, -0.9, 1.6) : null;
        labCom.anchor = sv ? new THREE.Vector3(0, -0.35, 0) : null;
        labCop.anchor = sv ? new THREE.Vector3(0, 0.4, COP_Z) : null;

        labFlight.anchor = (sv && jump) ? new THREE.Vector3(0, 0, -3.0) : null;
        labWind.anchor = wOn ? new THREE.Vector3(wdir * 2.0, 1.75, 0) : null;
        labYaw.anchor = wOn ? new THREE.Vector3(wdir * 1.5, 0.15, -0.7) : null;
        labJump.anchor = wOn ? new THREE.Vector3(0, (st.js >= 0 ? 1 : -1) * 1.75, -LEN / 2) : null;

        const dOn = driftGroup.visible;
        labVel.anchor = dOn ? VEL_DIR.clone().multiplyScalar(2.6) : null;
        labGrav.anchor = dOn ? new THREE.Vector3(0, -1.6, 0) : null;
        labAoa.anchor = dOn ? new THREE.Vector3(ds * 0.4, 1.1, -1.4) : null;
        labDrift.anchor = dOn ? new THREE.Vector3(ds * 1.6, -1.7, 0) : null;
        labTraj.anchor = dOn ? new THREE.Vector3(0, -0.94, -2.9) : null;
        labDrift.text = ds > 0 ? 'spin drift →' : '← spin drift';
        labDrift.el.textContent = labDrift.text;
        if (dOn) driftArrow.setDirection(new THREE.Vector3(ds, 0, 0));
    }

    applyState();
    requestAnimationFrame(frame);

    // ---- builders -----------------------------------------------------------
    // Copper jacket with darker helical grooves; repeat.x flips the helix for LH.
    function makeRiflingTexture()
    {
        const W = 512, H = 256, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#7d5a32');
        grad.addColorStop(0.5, '#c79a5e');
        grad.addColorStop(1, '#7d5a32');
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(60,42,20,0.55)';
        g.lineWidth = 7;
        const lands = 6, slope = -150; // sign sets the helix hand
        for (let i = 0; i < lands; i++)
        {
            const u0 = (i / lands) * W;
            for (const off of [-W, 0, W])
            {
                g.beginPath();
                g.moveTo(u0 + off, 0);
                g.lineTo(u0 + slope + off, H);
                g.stroke();
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.center.set(0.5, 0.5);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    // A circular arc in the plane spanned by unit vectors u, v (sweeping a0->a1),
    // optionally capped with a cone arrowhead at the a1 end. Returns a Group.
    function makeArc(u, v, r, a0, a1, color, head)
    {
        const grp = new THREE.Group();
        const segs = 40, verts = [];
        for (let i = 0; i <= segs; i++)
        {
            const a = a0 + (a1 - a0) * (i / segs);
            verts.push(u.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r));
        }
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(verts),
            new THREE.LineBasicMaterial({ color })));
        if (head)
        {
            const tip = verts[verts.length - 1];
            const tan = u.clone().multiplyScalar(-Math.sin(a1)).addScaledVector(v, Math.cos(a1)).normalize();
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 12), new THREE.MeshBasicMaterial({ color }));
            cone.position.copy(tip);
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
            grp.add(cone);
        }
        return grp;
    }
}
