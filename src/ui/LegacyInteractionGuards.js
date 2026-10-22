/** DOM-level UI ownership only. No legacy prototype or economy/health writer patch. */
export function installLegacyInteractionGuards(){
 const keys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyQ','KeyV','KeyE']);let modal=false;
 const visible=()=>[...document.querySelectorAll('.modal-layer')].some(e=>!e.hidden&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none');
 const check=()=>{const next=visible();if(next&&!modal)for(const code of keys)window.dispatchEvent(new KeyboardEvent('keyup',{code,key:code.startsWith('Key')?code.slice(3).toLowerCase():code==='Space'?' ':code,bubbles:true}));modal=next;};
 window.addEventListener('keydown',e=>{check();if(modal&&keys.has(e.code)){if(!e.target.closest?.('button,input,select,textarea'))e.preventDefault();e.stopImmediatePropagation();}},true);
 const start=()=>{const style=document.createElement('style');style.dataset.zgeUiGuards='v1';style.textContent='.game-shell{overflow:clip!important}.build-dock{max-height:38vh;overflow:auto;overscroll-behavior:contain}';document.head.append(style);new MutationObserver(check).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','class']});check();};if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
}
