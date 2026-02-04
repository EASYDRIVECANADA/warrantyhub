import { useMemo, useState } from "react";

import { Input } from "./ui/input";

type FaqItem = {
  category: string;
  question: string;
  answer: string;
};

const FAQS: FaqItem[] = [
  {
    category: "General",
    question: "What is Bridge Warranty?",
    answer:
      "Bridge Warranty is a platform that connects warranty providers and dealers in one system.\n\nProviders list and manage warranty products, and dealers sell those warranties to customers and submit remittances—all in one place.",
  },
  {
    category: "General",
    question: "How does Bridge Warranty work?",
    answer:
      "- Warranty providers create and publish warranty products.\n- Dealers browse available warranties in the marketplace.\n- Dealers sell warranties to customers and create contracts.\n- Dealers submit remittances for sold contracts.\n- Providers and admins review transactions and manage operations.",
  },
  {
    category: "General",
    question: "Who can use Bridge Warranty?",
    answer:
      "Bridge Warranty is designed for:\n\n- Warranty Providers (companies offering warranties)\n- Dealers (selling warranties to customers)\n- Admins & Super Admins (platform oversight and approvals)\n\nCustomers do not log in to Bridge Warranty.",
  },
  {
    category: "Account & Access",
    question: "Why can’t I access the dashboard after signing up?",
    answer:
      "New accounts must be approved by a Super Admin before full access is granted. Once approved, you’ll automatically see the correct dashboard for your role.",
  },
  {
    category: "Account & Access",
    question: "How long does approval take?",
    answer:
      "Most access requests are reviewed within 1 business day. If it takes longer, please contact support through the Help & Support Chat.",
  },
  {
    category: "Account & Access",
    question: "Can I change my role after signing up?",
    answer:
      "No. Roles are assigned by a Super Admin to ensure security and proper access. If your role is incorrect, contact support.",
  },
  {
    category: "Account & Access",
    question: "I signed up but chose the wrong role. What should I do?",
    answer:
      "Send a message through the Help & Support Chat with:\n\n- Your email\n- Correct role\n- Company name (if applicable)\n\nSupport will review and update your account.",
  },
  {
    category: "Providers",
    question: "How do I become a warranty provider on Bridge Warranty?",
    answer:
      "- Sign up and select Provider as your role.\n- Enter your company name during the request.\n- Wait for Super Admin approval.\n- Once approved, you can create and publish warranty products.",
  },
  {
    category: "Providers",
    question: "Who can create warranty products?",
    answer: "Only approved warranty providers can create and manage warranty products.",
  },
  {
    category: "Providers",
    question: "Can providers edit pricing after publishing a product?",
    answer:
      "Yes. Providers can edit pricing, update coverage details, and unpublish products if needed.\n\nChanges only affect new contracts, not existing ones.",
  },
  {
    category: "Providers",
    question: "Why can’t I see my products in the marketplace?",
    answer:
      "Products must be published before dealers can see them. Draft products are only visible to the provider.",
  },
  {
    category: "Dealers",
    question: "How do dealers sell warranties?",
    answer:
      "- Browse published warranties in the marketplace\n- Create a contract for a customer\n- Mark the contract as SOLD\n- Submit remittance for review",
  },
  {
    category: "Dealers",
    question: "Why can’t I create my own warranty products?",
    answer:
      "Dealers are not allowed to create warranties. Warranty creation is restricted to providers to protect pricing and coverage accuracy.",
  },
  {
    category: "Dealers",
    question: "What is a remittance?",
    answer:
      "A remittance is the payment submission dealers send after selling warranties. It includes:\n\n- Sold contracts\n- Total amount due\n- Submission for admin review",
  },
  {
    category: "Dealers",
    question: "Why is my contract locked?",
    answer:
      "Once a contract is included in a remittance or marked as SOLD, it becomes locked to prevent changes that could affect financial records.",
  },
  {
    category: "Payments & Remittances",
    question: "What happens after I submit a remittance?",
    answer:
      "After submission:\n\n- Admin reviews the remittance\n- Provider is notified\n- Status updates to Approved or Rejected\n- You’ll see the status in your Remittances page.",
  },
  {
    category: "Payments & Remittances",
    question: "Can I edit a remittance after submitting it?",
    answer:
      "No. Submitted remittances are locked. If there’s an issue, contact support.",
  },
  {
    category: "Payments & Remittances",
    question: "Why was my remittance rejected?",
    answer:
      "Common reasons:\n\n- Incorrect amount\n- Missing contracts\n- Invalid contract status\n\nA rejection note will explain what needs to be fixed.",
  },
  {
    category: "Help & Support Chat",
    question: "What is the Help & Support Chat?",
    answer:
      "It’s a real-time support messaging system where you can ask questions, report issues, and get help from the Bridge Warranty team.\n\nIt’s not an AI bot — real people respond.",
  },
  {
    category: "Help & Support Chat",
    question: "Do I need to be logged in to use the chat?",
    answer:
      "Yes. You must be logged in so support can see your role (Provider or Dealer), your company, and your account details. This helps us respond faster.",
  },
  {
    category: "Help & Support Chat",
    question: "When will someone reply to my message?",
    answer:
      "Support messages are reviewed during business hours. You’ll receive a reply as soon as a team member is available.",
  },
  {
    category: "Help & Support Chat",
    question: "Is my chat history saved?",
    answer:
      "Yes. All conversations are saved so you can continue past discussions, reference previous answers, and avoid repeating issues.",
  },
  {
    category: "Technical Issues",
    question: "I can’t see any data on my dashboard. Why?",
    answer:
      "This usually means:\n\n- Your account isn’t approved yet\n- Your role isn’t assigned correctly\n- You’re logged into the wrong account\n\nContact support if the issue continues.",
  },
];

export function SupportFaqs({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return FAQS;
    return FAQS.filter((item) => {
      const hay = `${item.category} ${item.question} ${item.answer}`.toLowerCase();
      return hay.includes(q);
    });
  }, [q]);

  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const titleClass = compact ? "text-xs font-semibold" : "text-sm font-semibold";

  return (
    <details className="rounded-lg border bg-background">
      <summary className="cursor-pointer select-none px-3 py-2">
        <span className={titleClass}>FAQs</span>
        <span className={compact ? "ml-2 text-[11px] text-muted-foreground" : "ml-2 text-xs text-muted-foreground"}>
          Bridge Warranty-Help & Support
        </span>
      </summary>
      <div className="px-3 pb-3">
        <div className="mt-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search FAQs"
            className={compact ? "h-9 text-xs" : ""}
          />
        </div>

        {grouped.length === 0 ? (
          <div className={compact ? "mt-3 text-xs text-muted-foreground" : "mt-3 text-sm text-muted-foreground"}>No matches.</div>
        ) : (
          <div className={compact ? "mt-3 max-h-[220px] overflow-auto pr-1 space-y-4" : "mt-3 space-y-4"}>
            {grouped.map(([category, items]) => (
              <div key={category}>
                <div className={compact ? "text-[11px] font-semibold text-muted-foreground" : "text-xs font-semibold text-muted-foreground"}>
                  {category}
                </div>
                <div className="mt-2 space-y-2">
                  {items.map((item) => (
                    <details key={item.question} className="rounded-md border bg-card">
                      <summary
                        className={
                          compact
                            ? "cursor-pointer select-none px-3 py-2 text-xs"
                            : "cursor-pointer select-none px-3 py-2 text-sm"
                        }
                      >
                        {item.question}
                      </summary>
                      <div
                        className={
                          compact
                            ? "px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap"
                            : "px-3 pb-3 text-sm text-muted-foreground whitespace-pre-wrap"
                        }
                      >
                        {item.answer}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={compact ? "mt-3 text-[11px] text-muted-foreground" : "mt-3 text-xs text-muted-foreground"}>
          If you still need help, send us a message below.
        </div>
      </div>
    </details>
  );
}
