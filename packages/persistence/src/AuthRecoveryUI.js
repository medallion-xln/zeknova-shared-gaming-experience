/** User-triggered retry after the server proves the same identity is authenticated. */
export function installAuthRecoveryUI({window:win,transport,nativeFetch,teamCode,userId}){
 const doc=win.document;if(!doc?.body)return{refresh(){},dispose(){}};
 const panel=doc.createElement('div');panel.id='zge-save-recovery';panel.setAttribute('role','status');panel.style.cssText='position:fixed;bottom:12px;right:12px;z-index:100000;max-width:300px;padding:12px;background:#192938;color:white;border:2px solid #e4b773;font:14px system-ui';
 const message=doc.createElement('p'),button=doc.createElement('button');button.type='button';button.textContent='Check sign-in and retry save';panel.append(message,button);doc.body.append(panel);
 const refresh=()=>{panel.hidden=transport.state!=='auth-expired';if(!panel.hidden)message.textContent='Save paused. Sign in again as the same player in another tab, then retry here.';};
 button.onclick=async()=>{button.disabled=true;try{const r=await nativeFetch('./api/session.php',{credentials:'same-origin',cache:'no-store'}),data=await r.json();if(!r.ok||String(data.user?.id)!==String(userId)||data.user?.teamCode!==teamCode)throw Error('The original player and team must be signed in before retrying.');transport.resume();refresh();}catch(e){message.textContent=e.message;}finally{button.disabled=false;}};
 refresh();return{refresh,dispose(){panel.remove();}};
}
