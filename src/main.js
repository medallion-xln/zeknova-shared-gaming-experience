import { runLoginPage } from "./ui/LoginPage.js";

document.documentElement.dataset.zeknovaSource = "auth55";

function loadGameStyles() {
  const styles = [
    ["./assets/index-Bjdqeidf.css", "game-core"],
    ["./assets/campaign-35cfe1bd.css", "game-campaign"],
    ["./assets/message-center.css?v=auth55", "game-messages"],
    ["./assets/team-chat.css?v=auth55", "game-chat"],
  ];
  for (const [href, id] of styles) {
    if (document.querySelector(`link[data-zeknova-style="${id}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.zeknovaStyle = id;
    document.head.appendChild(link);
  }
}

async function launch() {
  const root = document.getElementById("app");
  const { user } = await runLoginPage(root);
  if (!user) throw new Error("An authenticated officer is required to launch ZekNova.");

  loadGameStyles();
  const [gameModule, Player, Enemies, Missions, Terrain, Collision, Biomes, multiplayerModule, messageModule, chatModule] = await Promise.all([
    import("./game/Game.js"),
    import("./game/Player.js"),
    import("./game/Enemies.js"),
    import("./game/Missions.js"),
    import("./world/Terrain.js"),
    import("./world/Collision.js"),
    import("./world/Biomes.js"),
    import("./multiplayer/MultiplayerClient.js"),
    import("./ui/MessageCenter.js"),
    import("./ui/TeamChat.js"),
  ]);
  const { Game } = gameModule;
  window.ZekNovaSource = Object.freeze({
    Game, Player, Enemies, Missions, Terrain, Collision, Biomes,
    MultiplayerClient: multiplayerModule.MultiplayerClient,
    MessageCenter: messageModule.MessageCenter,
    TeamChat: chatModule.TeamChat,
  });
  document.documentElement.dataset.zeknovaModules = Object.keys(window.ZekNovaSource).join(",");
  // Install before the runtime loads so every heartbeat carries chat traffic.
  const teamChat = new chatModule.TeamChat({ user });
  teamChat.install();
  teamChat.mount(document.body);
  const game = new Game();
  await game.start({ user });
}

launch().catch((error) => {
  console.error("ZekNova failed to start.", error);
  const root = document.getElementById("app");
  if (root) root.innerHTML = '<main class="fatal-error"><h1>ZekNova could not start</h1><p>Reload the page or contact mission control.</p></main>';
});
