export class MultiplayerClient {
  constructor({ endpoint="./api/multiplayer.php", credentials="include", fetchImpl=globalThis.fetch, now=Date.now, random=Math.random }={}) {
    this.endpoint=endpoint; this.credentials=credentials; this.fetchImpl=fetchImpl; this.now=now; this.random=random;
    this.state="offline"; this.failures=0; this.retryAt=0; this.terminal=false;
  }

  status() { return Object.freeze({ state:this.state, failures:this.failures, retryAt:this.retryAt, terminal:this.terminal }); }

  async sync(payload,{signal}={}) {
    if (this.terminal) return { skipped:true, reason:"session-expired" };
    if (this.now()<this.retryAt) return { skipped:true, reason:"backoff", retryAt:this.retryAt };
    if (globalThis.navigator && navigator.onLine===false) {
      this.state="offline"; this.scheduleRetry(); return { skipped:true, reason:"browser-offline", retryAt:this.retryAt };
    }
    try {
      const response=await this.fetchImpl(this.endpoint,{method:"POST",credentials:this.credentials,headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload),signal});
      if (response.status===401 || response.status===403) {
        this.state="session-expired"; this.terminal=true;
        return { skipped:true, reason:"session-expired", status:response.status };
      }
      if (!response.ok) throw new Error(`Multiplayer sync failed (${response.status})`);
      this.state="online"; this.failures=0; this.retryAt=0;
      return response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      this.state="recovering"; this.scheduleRetry();
      return { skipped:true, reason:"network-error", retryAt:this.retryAt, error:error instanceof Error?error.message:String(error) };
    }
  }

  scheduleRetry() {
    this.failures=Math.min(this.failures+1,8);
    this.retryAt=this.now()+Math.min(30_000,600*(2**this.failures))+Math.floor(this.random()*250);
  }

  resumeAfterAuthentication() { this.state="offline"; this.failures=0; this.retryAt=0; this.terminal=false; }
}
