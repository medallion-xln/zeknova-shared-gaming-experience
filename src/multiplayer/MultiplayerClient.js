export class MultiplayerClient {
  constructor({ endpoint = "./api/multiplayer.php", credentials = "include" } = {}) {
    this.endpoint = endpoint;
    this.credentials = credentials;
  }

  async sync(payload, { signal } = {}) {
    const response = await fetch(this.endpoint, { method: "POST", credentials: this.credentials, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload), signal });
    if (!response.ok) throw new Error(`Multiplayer sync failed (${response.status})`);
    return response.json();
  }
}

