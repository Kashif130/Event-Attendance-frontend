import { Link } from "react-router-dom";
import { EmptyState, buttonClass } from "../components/ui";

export function NotFound() {
  return (
    <EmptyState title="This page doesn't exist">
      <p>Check the address, or go back to the overview.</p>
      <Link to="/" className={`${buttonClass("primary")} mt-4`}>
        Back to overview
      </Link>
    </EmptyState>
  );
}
