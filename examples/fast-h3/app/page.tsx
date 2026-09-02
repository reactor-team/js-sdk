import { FastH3App } from "./FastH3App";
import { SetupRequired } from "./SetupRequired";

export const dynamic = "force-dynamic";

export default function Page() {
  return process.env.REACTOR_API_KEY ? <FastH3App /> : <SetupRequired />;
}
