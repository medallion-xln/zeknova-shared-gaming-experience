import{spawn}from'node:child_process';import net from'node:net';
const port=Number(process.env.ZGE_GATEWAY_PORT);if(!Number.isInteger(port)||port<1024||port>65535)process.exit(1);
const child=spawn('php',['-S','127.0.0.1:'+port,'packages/server-php/src/router.php'],{env:process.env,stdio:'ignore'});let stopping=false,ready=false;
const deadline=setTimeout(()=>stop(),3000);
function stop(){if(stopping)return;stopping=true;clearTimeout(deadline);clearInterval(probe);child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),1000);timer.unref();}
const probe=setInterval(()=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.on('error',()=>socket.destroy());socket.on('connect',()=>{socket.destroy();if(!ready&&!stopping){ready=true;clearTimeout(deadline);clearInterval(probe);process.send?.({event:'gateway-ready',port});}});},20);
child.on('error',()=>{stop();process.exitCode=1;});child.on('exit',code=>{clearTimeout(deadline);clearInterval(probe);process.exit(stopping?0:(code??1));});
process.on('disconnect',stop);for(const signal of['SIGINT','SIGTERM'])process.on(signal,stop);
