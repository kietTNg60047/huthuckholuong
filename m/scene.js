// Khối 3D: quả bom (model thật từ KiCad) + bộ bài dựng bằng code.
// Chỉ được nạp khi người xem cuộn tới, qua import động trong index.html.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ---- GÓC ĐẶT QUẢ BOM — sửa hai số này nếu muốn đổi góc nhìn ----
   lean : nghiêng về phía người xem, tính bằng radian.
            0     = nằm phẳng như đặt trên bàn
           -1.15  = dựng nghiêng, mặt nút quay về phía người xem  (đang dùng)
           -1.57  = dựng đứng hẳn, nhìn thẳng mặt trước
   spin : xoay quanh trục đứng của chính nó, chọn cạnh nào quay ra trước.
   Sửa xong bấm F5 là thấy ngay, không cần dựng lại gì.                  */
const TILT = { lean: 2.5, spin: 0 };

/* Tự xoay kiểu ĐUNG ĐƯA QUA LẠI, không quay tròn 360 độ.
   Nhờ vậy mặt nút lúc nào cũng hướng về người xem, và ở hai đầu nhịp đưa
   thì lộ ra một chút cạnh bên với mặt sau.
     amp   : biên độ, radian. 0.6 ≈ đưa qua lại 34 độ mỗi bên
     speed : tốc độ. 0.38 -> một nhịp đưa qua về mất khoảng 16 giây      */
const SWAY = { amp: 0.62, speed: 0.38 };

const CARDS = ["sparky", "nimbus", "flora", "moki"];
const CARD_W = 70, CARD_H = 116, CARD_T = 0.55;   // khổ bài thật, mm
const BOARD_W = 39;                                // bề rộng board thật, mm
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Gộp mọi mesh cùng vật liệu thành một. File GLB có ~29 mesh rời rạc,
   mỗi cái là một lệnh vẽ. Gộp lại còn đúng số vật liệu -> nhẹ hơn nhiều
   cho điện thoại yếu. */
function mergeByMaterial(root) {
  const bins = new Map();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) {
      if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const key = o.material.uuid;
    if (!bins.has(key)) bins.set(key, { mat: o.material, list: [] });
    bins.get(key).list.push(g);
  });

  const out = new THREE.Group();
  let calls = 0;
  for (const { mat, list } of bins.values()) {
    let geo = null;
    try { geo = list.length > 1 ? mergeGeometries(list, false) : list[0]; }
    catch (e) { geo = null; }
    if (geo) { out.add(new THREE.Mesh(geo, mat)); calls++; }
    else { list.forEach((g) => { out.add(new THREE.Mesh(g, mat)); calls++; }); }
  }
  out.userData.drawCalls = calls;
  return out;
}

function buildCards(loader) {
  const group = new THREE.Group();
  const back = loader.load("img/card-back.jpg");
  back.colorSpace = THREE.SRGBColorSpace;
  const edge = new THREE.MeshStandardMaterial({ color: 0x120f18, roughness: .85 });

  CARDS.forEach((name, i) => {
    const face = loader.load("img/card-" + name + ".jpg");
    face.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T),
      [edge, edge, edge, edge,
       new THREE.MeshStandardMaterial({ map: face, roughness: .34, metalness: .05 }),
       new THREE.MeshStandardMaterial({ map: back, roughness: .34, metalness: .05 })]
    );
    // xoè ra như đang cầm trên tay
    const t = i - (CARDS.length - 1) / 2;          // -1.5 .. 1.5
    mesh.position.set(t * 62, 26 - Math.abs(t) * 7, -Math.abs(t) * 26);
    mesh.rotation.z = -t * 0.15;
    mesh.rotation.y = -t * 0.26;
    group.add(mesh);
  });
  return group;
}

export async function start(host, onStatus) {
  const say = onStatus || (() => {});
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y";

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
  key.position.set(90, 150, 130); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc9a6ff, 1.1);
  rim.position.set(-130, 40, -110); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(34, 1, 1, 3000);
  const stage = new THREE.Group();
  scene.add(stage);

  const texLoader = new THREE.TextureLoader();
  stage.add(buildCards(texLoader));

  say("Đang tải mạch…");
  const gltf = await new GLTFLoader().loadAsync("m/bom.glb");

  const raw = gltf.scene;
  raw.rotation.x = -Math.PI / 2;                    // KiCad dung Z len, three dung Y len
  const merged = mergeByMaterial(raw);

  // đưa về đúng tỉ lệ thật so với lá bài, rồi đặt vào giữa
  const box = new THREE.Box3().setFromObject(merged);
  const size = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const s = BOARD_W / Math.max(size.x, size.z);
  merged.position.sub(ctr);
  /* Lồng hai nhóm để hai góc xoay độc lập nhau: nhóm trong xoay quanh trục
     đứng của board, nhóm ngoài nghiêng board về phía người xem. Nếu gộp vào
     một Euler thì đổi số này sẽ kéo theo số kia, rất khó chỉnh. */
  const spin = new THREE.Group();
  spin.add(merged);
  spin.rotation.y = TILT.spin;

  const bomb = new THREE.Group();
  bomb.add(spin);
  bomb.rotation.x = TILT.lean;
  bomb.scale.setScalar(s);
  bomb.position.set(0, -40, 66);
  stage.add(bomb);

  // ---- camera quay quanh trục đứng ----
  let az = -0.34, autoAz = 0;
  const EL = 0.30, R = 292, TARGET = new THREE.Vector3(0, -6, 0);
  function place() {
    const a = az + autoAz;
    camera.position.set(
      TARGET.x + R * Math.cos(EL) * Math.sin(a),
      TARGET.y + R * Math.sin(EL),
      TARGET.z + R * Math.cos(EL) * Math.cos(a)
    );
    camera.lookAt(TARGET);
  }

  /* Kéo để xoay — nhưng CHỈ khi cú vuốt nghiêng về phương ngang.
     Vuốt dọc được thả cho trang cuộn bình thường, nếu không người dùng
     điện thoại sẽ bị kẹt không cuộn qua được khối này. */
  let down = null, dragging = false, phase = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, az };
    dragging = false;
  });
  el.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!dragging) {
      if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
      if (Math.abs(dy) > Math.abs(dx)) { down = null; return; }  // nhường cho cuộn trang
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    }
    az = down.az - dx * 0.0085;
    e.preventDefault();
  });
  const release = () => { down = null; dragging = false; el.style.cursor = "grab"; };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.style.cursor = "grab";

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 620 ? 42 : 34;                 // màn hẹp thì mở góc cho đỡ tràn
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  let visible = true;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; },
    { threshold: 0 }).observe(host);

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!visible) return;                            // ra khỏi màn hình thì ngừng vẽ
    /* Chỉ chạy đồng hồ khi không kéo tay. Vì autoAz là sin(phase), dừng rồi
       chạy tiếp phase sẽ không bị giật — khác hẳn kiểu cộng dồn góc. */
    if (!dragging && !REDUCED) phase += dt * SWAY.speed;
    autoAz = SWAY.amp * Math.sin(phase);
    place();
    renderer.render(scene, camera);
  });

  say("");
  return { drawCalls: merged.userData.drawCalls };
}
