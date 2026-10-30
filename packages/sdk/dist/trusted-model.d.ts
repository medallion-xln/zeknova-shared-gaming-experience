export const TRUSTED_MODEL_SCHEMA:'zge.trusted-model.v1';
export const KNOWN_EXTENSIONS:Readonly<Record<string,string|null>>;
export interface TrustedModel {
 readonly schema:typeof TRUSTED_MODEL_SCHEMA;readonly path:string;readonly kind:'geometry'|'animation';readonly sourceFormat:'glb2';readonly sourceBytes:number;readonly sourceSha256:string;
 readonly extensions:readonly string[];readonly extensionsRequired:readonly string[];readonly unknownExtensions:readonly string[];readonly requiresDecoders:readonly string[];
 readonly skinned:boolean;readonly skins:number;readonly animations:readonly string[];readonly textured:boolean;readonly nodes:number;readonly meshes:number;readonly primitives:number;readonly materials:number;readonly images:number;readonly textures:number;readonly attributes:readonly string[];readonly vertices:number;
}
export function readGLBHeader(bytes:Uint8Array|ArrayBuffer):Record<string,unknown>;
export function describeTrustedModel(options:{path:string;bytes:Uint8Array|ArrayBuffer;maxBytes?:number}):Promise<TrustedModel>;
export function validateTrustedModel(data:unknown):TrustedModel;
export function requiredDecoders(manifests:readonly Pick<TrustedModel,'requiresDecoders'>[]):string[];
