export default class VRSessionManager {
  currentSession: XRSession | null;
  renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.currentSession = null;
  }

  async startSession() {
    if (this.currentSession === null) {
      const sessionInit = {
        "optionalFeatures": ["local-floor", "bounded-floor", "hand-tracking", "layers"],
      };
      try {
        if (!navigator.xr) {
          throw new Error("!WebXR");
        }
        const session = await navigator.xr.requestSession("immersive-vr", sessionInit);
        // session.addEventListener("end", () => this.endSession());
        await this.renderer.xr["setSession"](session);
        this.currentSession = session;
      } catch (error) {
        console.error(error);
      }
    } else {
      this.currentSession.end();
    }
  }

  endSession() {
    if (this.currentSession) {
      this.currentSession.end();
      this.currentSession = null;
    }
  }
}
