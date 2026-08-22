/**
 * Picasso runtime style compiler.
 * Compiles cached style intelligence into renderer, shader, outline, and
 * screen-composite settings. Appearance only: no gameplay object is read back
 * or written through this surface.
 */
import {
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
} from "../../assets/vendor/three.module.min.js";

const OUTLINE_NAME = "PicassoVisualOutline";
const STYLE_CLASS_PREFIX = "picasso-style-";
const MAX_OUTLINED_MESHES = 96;

const COMPILED = Object.freeze({
  zeknova: Object.freeze({
    shaderFamily: "ZekNovaPBR", saturation: 1.05, contrast: 1.02, brightness: 1,
    hue: 0, blur: 0, bloom: .12, grain: 0, vignette: .12, chromatic: 0,
    toonSteps: 0, outline: 0, outlineColor: 0x061015, rim: 0, iridescence: 0,
    shadowOpacity: .35, textureDetail: 1,
  }),
  anime: Object.freeze({
    shaderFamily: "AnimeToon", saturation: 1.55, contrast: 1.22, brightness: 1.08,
    hue: -5, blur: 0, bloom: .2, grain: 0, vignette: .06, chromatic: 0,
    toonSteps: 4, outline: 1.8, outlineColor: 0x101428, rim: .55, rimColor: 0x74d9ff,
    iridescence: 0, shadowOpacity: .18, textureDetail: .58,
  }),
  cartoon: Object.freeze({
    shaderFamily: "CartoonFlat", saturation: 1.8, contrast: 1.32, brightness: 1.12,
    hue: 7, blur: 0, bloom: .08, grain: 0, vignette: 0, chromatic: 0,
    toonSteps: 2, outline: 2.8, outlineColor: 0x17131e, rim: .25, rimColor: 0xffe06b,
    iridescence: 0, shadowOpacity: .1, textureDetail: .32,
  }),
  cinematic: Object.freeze({
    shaderFamily: "CinematicPBR", saturation: .92, contrast: 1.38, brightness: .88,
    hue: -3, blur: 0, bloom: .48, grain: .09, vignette: .48, chromatic: .35,
    toonSteps: 0, outline: 0, outlineColor: 0, rim: .12, rimColor: 0xffc986,
    iridescence: 0, shadowOpacity: .58, textureDetail: 1.1,
  }),
  ultra_realistic: Object.freeze({
    shaderFamily: "UltraPBR", saturation: .82, contrast: 1.3, brightness: .93,
    hue: 0, blur: 0, bloom: .2, grain: .025, vignette: .28, chromatic: .08,
    toonSteps: 0, outline: 0, outlineColor: 0, rim: .08, rimColor: 0xffffff,
    iridescence: 0, shadowOpacity: .68, textureDetail: 1.25,
  }),
  alien_dream: Object.freeze({
    shaderFamily: "AlienIridescent", saturation: 1.72, contrast: 1.32, brightness: 1.02,
    hue: 42, blur: .25, bloom: .72, grain: .035, vignette: .38, chromatic: 1.6,
    toonSteps: 0, outline: .7, outlineColor: 0x40105f, rim: .75, rimColor: 0xff4dff,
    iridescence: .78, shadowOpacity: .28, textureDetail: .82,
  }),
});

function escapeCssUrl(value) {
  return String(value).replace(/["\\\n\r]/g, "");
}

function installSvgFilters() {
  if (typeof document === "undefined" || document.getElementById("picasso-svg-filters")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "picasso-svg-filters";
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:fixed;width:0;height:0;pointer-events:none";
  svg.innerHTML = `<defs>
    <filter id="picasso-anime"><feComponentTransfer><feFuncR type="discrete" tableValues="0 .18 .42 .7 1"/><feFuncG type="discrete" tableValues="0 .2 .48 .76 1"/><feFuncB type="discrete" tableValues="0 .24 .58 .84 1"/></feComponentTransfer></filter>
    <filter id="picasso-cartoon"><feComponentTransfer><feFuncR type="discrete" tableValues="0 .25 .55 .82 1"/><feFuncG type="discrete" tableValues="0 .28 .6 .86 1"/><feFuncB type="discrete" tableValues="0 .22 .5 .78 1"/></feComponentTransfer></filter>
  </defs>`;
  document.body.appendChild(svg);
}

function ensureCompositeLayer(canvas) {
  if (typeof document === "undefined" || !canvas) return null;
  let layer = document.getElementById("picasso-screen-composite");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "picasso-screen-composite";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  return layer;
}

function materialList(node) {
  return Array.isArray(node?.material) ? node.material : [node?.material].filter(Boolean);
}

function importantVisual(node) {
  const key = `${node?.name || ""} ${node?.userData?.type || ""} ${node?.userData?.enemyType || ""} ${node?.userData?.bossId || ""}`;
  return /player|officer|captain|lieutenant|ensign|enemy|zeknovan|boss|building|settlement|village|colony|habitat|projectile|resource/i.test(key);
}

export class PicassoRuntimeStyleCompiler {
  constructor({ renderer, scene } = {}) {
    this.renderer = renderer || null;
    this.scene = scene || null;
    this.canvas = renderer?.domElement || null;
    this.outlines = [];
    this.materialBaselines = new WeakMap();
    this.compiled = COMPILED.zeknova;
    this.context = null;
    this.performanceTier = "Ultra";
    this.performanceScale = Object.freeze({ outlineScale: 1, postScale: 1 });
  }

  compile(profile, context = {}) {
    const id = String(profile?.id ?? "zeknova").toLowerCase();
    const base = COMPILED[id] || COMPILED.zeknova;
    const biomeHue = { forest: -3, desert: 8, highlands: 0, arctic: -10, wetlands: 12 }[context.biome] || 0;
    const combatBloom = Math.min(.18, Number(context.combatIntensity || 0) * .18);
    return Object.freeze({
      ...base,
      hue: base.hue + biomeHue,
      bloom: Math.min(1, base.bloom + combatBloom),
      profileId: id,
      context,
    });
  }

  apply(profile, context = {}) {
    this.compiled = this.compile(profile, context);
    this.context = context;
    this.applyScreenComposite(this.compiled);
    this.applyShaderFamilies(this.compiled);
    this.applyOutlines(this.compiled);
    this.applyShadows(this.compiled);
    return this.compiled;
  }

  applyScreenComposite(style) {
    if (!this.canvas || typeof document === "undefined") return;
    installSvgFilters();
    const layer = ensureCompositeLayer(this.canvas);
    const html = document.documentElement;
    [...html.classList].filter((name) => name.startsWith(STYLE_CLASS_PREFIX)).forEach((name) => html.classList.remove(name));
    html.classList.add(`${STYLE_CLASS_PREFIX}${style.profileId}`);
    html.style.setProperty("--picasso-saturation", String(style.saturation));
    html.style.setProperty("--picasso-contrast", String(style.contrast));
    html.style.setProperty("--picasso-brightness", String(style.brightness));
    html.style.setProperty("--picasso-hue", `${style.hue}deg`);
    html.style.setProperty("--picasso-blur", `${style.blur}px`);
    html.style.setProperty("--picasso-bloom", String(style.bloom));
    html.style.setProperty("--picasso-grain", String(style.grain));
    html.style.setProperty("--picasso-vignette", String(style.vignette));
    html.style.setProperty("--picasso-chromatic", `${style.chromatic}px`);
    layer.dataset.theme = style.profileId;
    layer.dataset.shaderFamily = style.shaderFamily;
    layer.style.setProperty("--picasso-outline-strength", String(style.outline));
    const svgFilter = style.profileId === "anime" || style.profileId === "cartoon" ? ` url(\"#picasso-${escapeCssUrl(style.profileId)}\")` : "";
    this.canvas.style.filter = `saturate(${style.saturation}) contrast(${style.contrast}) brightness(${style.brightness}) hue-rotate(${style.hue}deg) blur(${style.blur}px)${svgFilter}`;
  }

  rememberMaterial(material) {
    if (this.materialBaselines.has(material)) return this.materialBaselines.get(material);
    const baseline = {
      onBeforeCompile: material.onBeforeCompile,
      customProgramCacheKey: material.customProgramCacheKey,
      dithering: material.dithering,
      envMapIntensity: material.envMapIntensity,
    };
    this.materialBaselines.set(material, baseline);
    return baseline;
  }

  applyShaderFamilies(style) {
    if (!this.scene?.traverse) return;
    this.scene.traverse((node) => {
      if (!node?.material) return;
      for (const material of materialList(node)) {
        const baseline = this.rememberMaterial(material);
        material.userData = material.userData || {};
        material.onBeforeCompile = (shader, renderer) => {
          baseline.onBeforeCompile?.call(material, shader, renderer);
          if (!shader || typeof shader.fragmentShader !== "string") return;
          const steps = Math.max(0, Number(style.toonSteps || 0));
          const rim = Math.max(0, Number(style.rim || 0));
          const iri = Math.max(0, Number(style.iridescence || 0));
          const familyCode = `${style.shaderFamily}:${steps}:${rim}:${iri}`;
          shader.fragmentShader = String(shader.fragmentShader).replace(
            "#include <opaque_fragment>",
            `#include <opaque_fragment>\nfloat zkLum=dot(gl_FragColor.rgb,vec3(.299,.587,.114));\n${steps > 0 ? `gl_FragColor.rgb=floor(clamp(gl_FragColor.rgb,0.0,0.9999)*${steps.toFixed(1)})/${Math.max(1, steps - 1).toFixed(1)};` : ""}\n${rim > 0 ? `gl_FragColor.rgb+=vec3(${(rim * .08).toFixed(4)})*pow(1.0-zkLum,2.0);` : ""}\n${iri > 0 ? `gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.gbr,${(iri * .35).toFixed(4)}*(.5+.5*sin(zkLum*18.0)));` : ""}`,
          );
          material.userData.zkPicassoShader = { family: style.shaderFamily, code: familyCode };
        };
        material.customProgramCacheKey = () => `picasso:${style.profileId}:${style.shaderFamily}:${style.toonSteps}:${style.rim}:${style.iridescence}`;
        material.dithering = style.profileId === "cinematic" || style.profileId === "ultra_realistic";
        if (typeof material.envMapIntensity === "number") material.envMapIntensity = style.profileId === "ultra_realistic" ? 1.8 : style.profileId === "cinematic" ? 1.3 : .8;
        material.needsUpdate = true;
      }
    });
  }

  clearOutlines() {
    for (const outline of this.outlines.splice(0)) {
      outline.parent?.remove(outline);
      outline.geometry?.dispose?.();
      outline.material?.dispose?.();
    }
  }

  applyOutlines(style) {
    this.clearOutlines();
    if (!style.outline || !this.scene?.traverse) return;
    let count = 0;
    this.scene.traverse((node) => {
      if (count >= MAX_OUTLINED_MESHES || !node?.isMesh || node.isSkinnedMesh || !node.geometry || !importantVisual(node)) return;
      try {
        const geometry = new EdgesGeometry(node.geometry, style.profileId === "cartoon" ? 18 : 28);
        const material = new LineBasicMaterial({ color: new Color(style.outlineColor), transparent: true, opacity: Math.min(1, .5 + style.outline * .16), depthWrite: false });
        const outline = new LineSegments(geometry, material);
        outline.name = OUTLINE_NAME;
        outline.renderOrder = Number(node.renderOrder || 0) + 2;
        outline.scale.setScalar(1 + Math.min(.018, style.outline * .004));
        outline.userData = { zkVisualOnly: true, authoritativeGeometry: false, collisionEnabled: false };
        node.add(outline);
        this.outlines.push(outline);
        count += 1;
      } catch { /* unsupported generated geometry keeps its material treatment */ }
    });
  }

  applyShadows(style) {
    if (!this.scene?.traverse) return;
    this.scene.traverse((node) => {
      if (!node?.isLight || !node.shadow) return;
      node.shadow.bias = style.profileId === "cartoon" ? -.0015 : -.00025;
      node.shadow.normalBias = style.profileId === "anime" ? .035 : .015;
      node.shadow.radius = style.profileId === "cinematic" ? 3 : style.profileId === "cartoon" ? .5 : 1.5;
      node.userData = { ...(node.userData || {}), zkPicassoShadowOpacity: style.shadowOpacity };
    });
  }

  setPerformanceScale(tier, scale = {}) {
    this.performanceTier = String(tier || "Ultra");
    this.performanceScale = Object.freeze({
      outlineScale: Math.max(0, Math.min(1, Number(scale.outlineScale ?? 1))),
      postScale: Math.max(0, Math.min(1, Number(scale.postScale ?? 1))),
    });
    const postScale = this.performanceScale.postScale;
    const adaptive = {
      ...this.compiled,
      outline: this.compiled.outline * this.performanceScale.outlineScale,
      bloom: this.compiled.bloom * postScale,
      grain: this.compiled.grain * postScale,
      vignette: this.compiled.vignette * Math.max(.45, postScale),
      chromatic: this.compiled.chromatic * postScale,
      blur: this.compiled.blur * postScale,
    };
    this.applyScreenComposite(adaptive);
    this.applyOutlines(adaptive);
    return Object.freeze(adaptive);
  }

  report() {
    return Object.freeze({
      theme: this.compiled.profileId || "zeknova",
      shaderFamily: this.compiled.shaderFamily,
      outlinedMeshes: this.outlines.length,
      postProcessing: Object.freeze({
        saturation: this.compiled.saturation,
        contrast: this.compiled.contrast,
        bloom: this.compiled.bloom,
        grain: this.compiled.grain,
        vignette: this.compiled.vignette,
        hue: this.compiled.hue,
        chromatic: this.compiled.chromatic,
      }),
      appearanceOnly: true,
      performanceTier: this.performanceTier,
      performanceScale: this.performanceScale,
    });
  }

  dispose() {
    this.clearOutlines();
    if (this.canvas) this.canvas.style.filter = "";
    if (typeof document !== "undefined") {
      const html = document.documentElement;
      [...html.classList].filter((name) => name.startsWith(STYLE_CLASS_PREFIX)).forEach((name) => html.classList.remove(name));
      document.getElementById("picasso-screen-composite")?.remove();
    }
  }
}

export const PICASSO_COMPILED_STYLES = COMPILED;
export default PicassoRuntimeStyleCompiler;
