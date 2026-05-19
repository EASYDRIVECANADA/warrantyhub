import { AppRouter } from "./app/AppRouter";
import { ForcePasswordChangeDialog } from "./components/auth/ForcePasswordChangeDialog";

function App() {
  return (
    <>
      <AppRouter />
      <ForcePasswordChangeDialog />
    </>
  );
}

export default App;
