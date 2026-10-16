import { StatePanel } from "./_components/state-panel";

export default function WorkspaceLoading() {
  return <StatePanel tone="loading" title="Loading" body="Fetching cases for this workspace." />;
}
