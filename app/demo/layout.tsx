import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { DEMO_NOTICE } from "@/lib/demo/fixtures";

/** Every demo page carries the same notice and the same way out. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-mode">
      <div className="demo-banner" role="note">
        <span>
          <Icon name="info" /> <strong>{DEMO_NOTICE}</strong>
        </span>
        <Link href="/places">
          Exit to the real site <Icon name="exit" size={18} />
        </Link>
      </div>
      {children}
    </div>
  );
}
