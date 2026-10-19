export type AnyRecord = Record<string, any>;

export interface RasputimApi {
  getState(): Promise<AnyRecord>;
  authStatus(): Promise<AnyRecord>;
  setupAccount(payload: AnyRecord): Promise<AnyRecord>;
  login(payload: AnyRecord): Promise<AnyRecord>;
  logout(): Promise<AnyRecord>;
  getAppInfo(): Promise<AnyRecord>;
  getLocalAiStatus(): Promise<AnyRecord>;
  askLocalAi(prompt: string, model?: string): Promise<AnyRecord>;
  createPcpProject(payload: AnyRecord): Promise<AnyRecord>;
  updatePcpProject(id: string, payload: AnyRecord): Promise<AnyRecord>;
  transitionPcpProject(id: string, payload: AnyRecord): Promise<AnyRecord>;
  blockPcpProject(id: string, payload: AnyRecord): Promise<AnyRecord>;
  archivePcpProject(id: string, payload: AnyRecord): Promise<AnyRecord>;
  refreshPcp(): Promise<AnyRecord>;
  recordMovement(payload: AnyRecord): Promise<AnyRecord>;
  addMaterial(payload: AnyRecord): Promise<AnyRecord>;
  addTool(payload: AnyRecord): Promise<AnyRecord>;
  checkoutTool(payload: AnyRecord): Promise<AnyRecord>;
  returnTool(payload: AnyRecord): Promise<AnyRecord>;
  setToolStatus(id: string, payload: AnyRecord): Promise<AnyRecord>;
  removeTool(id: string): Promise<AnyRecord>;
  onPcpChanged(callback: (state: AnyRecord) => void): () => void;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

declare global {
  interface Window { rasputim: RasputimApi; }
}