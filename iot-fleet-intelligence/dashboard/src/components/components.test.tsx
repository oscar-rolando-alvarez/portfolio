import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { DemoEngine } from "@/lib/stream/demo";
import { useStore } from "@/lib/store";
import { IncidentDetail } from "./incidents/incident-detail";
import { KpiTile } from "./ui/kpi-tile";
import { Segmented } from "./ui/primitives";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href: _href, ...rest }: { children: ReactNode; href: unknown }) => <a {...rest}>{children}</a>,
}));

const wrap = (locale: "en" | "es", ui: ReactNode) =>
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : es} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

const view = () => {
  const e = new DemoEngine("acme-utilities", 300, 1_800_000_000_000);
  return e.incidents(300).find((v) => v.incident.suspected_fault === "cell_outage")!;
};

describe("IncidentDetail", () => {
  beforeEach(() => useStore.setState({ actions: {} }));

  it("renders the diagnosis in English", () => {
    wrap("en", <IncidentDetail view={view()} />);
    expect(screen.getByTestId("diagnosis-summary")).toHaveTextContent(/^Suspected cell outage/);
    expect(screen.getByText("Not required — fix remotely")).toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-locale")).toHaveTextContent("Written in EN");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Cell outage");
  });

  it("renders the Spanish diagnosis and labels when the locale is es", () => {
    wrap("es", <IncidentDetail view={view()} />);
    expect(screen.getByTestId("diagnosis-summary")).toHaveTextContent(/^Posible caída de celda/);
    expect(screen.getByTestId("customer-message")).toHaveTextContent(/Una interrupción temporal/);
    expect(screen.getByText("Plan de remediación")).toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-locale")).toHaveTextContent("Redactado en ES");
  });

  it("falls back to English when a translation is missing", () => {
    const v = view();
    wrap("es", <IncidentDetail view={{ ...v, diagnosis: { en: v.diagnosis.en } }} />);
    expect(screen.getByTestId("diagnosis-locale")).toHaveTextContent("Traducción no disponible");
    expect(screen.getByTestId("diagnosis-summary")).toHaveTextContent(/^Suspected/);
  });

  it("records a human-in-the-loop approval after confirmation", async () => {
    const user = userEvent.setup();
    const v = view();
    wrap("en", <IncidentDetail view={v} />);
    await user.click(screen.getByTestId("hitl-approve"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(useStore.getState().actions[v.incident.incident_id]?.kind).toBe("approved");
    expect(await screen.findByTestId("hitl-result")).toHaveTextContent(/Remediation approved/);
  });
});

describe("UI primitives", () => {
  it("KpiTile exposes the final value and delta to assistive tech", () => {
    render(
      <KpiTile
        label="Fleet availability"
        value={0.9912}
        format={(x) => `${(x * 100).toFixed(2)}%`}
        delta={{ value: "0.3%", direction: "down", good: false, label: "vs 5 min ago" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Fleet availability" })).toBeInTheDocument();
    expect(screen.getByText("99.12%", { selector: ".sr-only" })).toBeInTheDocument();
    expect(screen.getByText("vs 5 min ago")).toBeInTheDocument();
  });

  it("KpiTile shows a skeleton while loading", () => {
    const { container } = render(<KpiTile label="X" loading value={1} format={String} />);
    expect(container.querySelector("[aria-hidden]")).toBeTruthy();
    expect(screen.queryByText("1")).toBeNull();
  });

  it("Segmented is a keyboard-reachable radio group", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Segmented
        label="Language"
        value="en"
        onChange={onChange}
        options={[
          { value: "en", label: "EN" },
          { value: "es", label: "ES" },
          { value: "fr", label: "FR", disabled: true },
        ]}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "EN" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "ES" }));
    expect(onChange).toHaveBeenCalledWith("es");
    expect(screen.getByRole("radio", { name: "FR" })).toBeDisabled();
  });
});
