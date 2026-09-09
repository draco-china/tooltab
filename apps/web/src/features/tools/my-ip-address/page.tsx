import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Card, Skeleton } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  detectWebRtcExposure,
  lookupIpMetadata,
  lookupPublicIp,
  type PublicIpVersion,
} from "../network-lookups/logic";
import type { IpInfo } from "@workspace/tools/network/lookups";

type AddressState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; address: string; info: IpInfo };
type WebRtcAddress = { address: string; info: IpInfo };

const INITIAL_STATE: AddressState = { status: "loading" };

function MyIpAddressContent() {
  const [ipv4, setIpv4] = useState<AddressState>(INITIAL_STATE);
  const [ipv6, setIpv6] = useState<AddressState>(INITIAL_STATE);
  const [webrtcAddresses, setWebrtcAddresses] = useState<WebRtcAddress[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAddress(
      version: PublicIpVersion,
      setState: (state: AddressState) => void,
    ) {
      try {
        const { address } = await lookupPublicIp(version, controller.signal);
        const { info } = await lookupIpMetadata(address, controller.signal);
        if (!controller.signal.aborted) {
          setState({ status: "ready", address, info });
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }

    async function loadWebRtcAddresses() {
      if (typeof RTCPeerConnection === "undefined") return;
      try {
        const candidates = await detectWebRtcExposure(
          undefined,
          controller.signal,
        );
        const details = await Promise.all(
          candidates.map(async ({ address }) => ({
            address,
            info: (await lookupIpMetadata(address, controller.signal)).info,
          })),
        );
        if (!controller.signal.aborted) setWebrtcAddresses(details);
      } catch {
        if (!controller.signal.aborted) setWebrtcAddresses([]);
      }
    }

    void Promise.all([
      loadAddress("ipv4", setIpv4),
      loadAddress("ipv6", setIpv6),
      loadWebRtcAddresses(),
    ]);

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <div className="grid gap-6 xl:grid-cols-2">
          <AddressCard
            title="IPv4"
            description={m["tools.myIpAddress.ipv4Description"]()}
            state={ipv4}
          />
          <AddressCard
            title="IPv6"
            description={m["tools.myIpAddress.ipv6Description"]()}
            state={ipv6}
          />
        </div>

        {webrtcAddresses.length > 0 ? (
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>{m["tools.myIpAddress.webrtcLeak"]()}</Card.Title>
              <Card.Description>
                {m["tools.myIpAddress.webrtcDescription"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="grid gap-4 py-4 md:grid-cols-2">
              {webrtcAddresses.map((entry) => (
                <div
                  key={entry.address}
                  className="rounded-xl border border-separator bg-default/20 p-4"
                >
                  <AddressSummary address={entry.address} />
                  <InfoList info={entry.info} />
                </div>
              ))}
            </ToolPanelCardContent>
          </ToolPanelCard>
        ) : null}
      </div>

      <ToolArticle>
        {[
          [
            m["tools.myIpAddress.article00"](),
            m["tools.myIpAddress.article01"](),
          ],
          [
            m["tools.myIpAddress.article10"](),
            m["tools.myIpAddress.article11"](),
          ],
          [
            m["tools.myIpAddress.article20"](),
            m["tools.myIpAddress.article21"](),
          ],
          [
            m["tools.myIpAddress.article30"](),
            m["tools.myIpAddress.article31"](),
          ],
        ].map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </ToolArticle>
    </div>
  );
}

function AddressCard({
  title,
  description,
  state,
}: Readonly<{
  title: string;
  description: string;
  state: AddressState;
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-1">
          <Card.Title>{title}</Card.Title>
          <Card.Description>{description}</Card.Description>
        </div>
        {state.status === "ready" ? (
          <ToolCopyButton
            value={state.address}
            copyLabel={m["tools.myIpAddress.copyIp"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
        ) : null}
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        {state.status === "ready" ? (
          <div className="flex flex-col gap-4">
            <AddressSummary address={state.address} />
            <InfoList info={state.info} />
          </div>
        ) : state.status === "loading" ? (
          <AddressSkeleton />
        ) : (
          <StatusState
            title={m["tools.myIpAddress.unableToGetIp"]()}
            description={m["tools.myIpAddress.unableToGetIpDescription"]()}
          />
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function AddressSkeleton() {
  return (
    <div
      className="grid min-h-56 content-center gap-4 py-2"
      role="status"
      aria-label={m["tools.myIpAddress.fetchingIp"]()}
      aria-busy="true"
    >
      <div className="grid gap-2 text-center">
        <p className="text-sm font-medium">
          {m["tools.myIpAddress.fetchingIp"]()}
        </p>
        <p className="text-sm text-muted">
          {m["tools.myIpAddress.fetchingIpDescription"]()}
        </p>
      </div>
      <Skeleton className="mx-auto h-7 w-2/3 rounded-lg" />
      <div className="grid gap-3 border-t border-separator pt-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        {["hostname", "isp", "location", "timezone"].map((row) => (
          <div key={row} className="contents">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-4 py-2 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger-soft-foreground">
        <TriangleAlert aria-hidden className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
    </div>
  );
}

function AddressSummary({ address }: Readonly<{ address: string }>) {
  return (
    <p className="font-mono text-xl font-semibold tracking-tight break-all sm:text-2xl">
      {address}
    </p>
  );
}

function InfoList({ info }: Readonly<{ info: IpInfo }>) {
  const location =
    info.latitude === null || info.longitude === null
      ? null
      : `${info.longitude} / ${info.latitude}`;
  const rows = [
    [m["shared.addressTools.hostname"](), info.hostname],
    [m["tools.myIpAddress.isp"](), info.isp],
    [m["tools.myIpAddress.ipOrganization"](), info.organization],
    [
      m["tools.ipInfoLookup.asn"](),
      info.asn === null ? null : String(info.asn),
    ],
    [m["tools.myIpAddress.asnOrganization"](), info.asnOrganization],
    [m["shared.qrTools.location"](), location],
    [m["common.identityCountry"](), info.country],
    [m["tools.deviceInformation.summaryTimezone"](), info.timezone],
  ] as const;

  return (
    <dl className="grid gap-3 border-t border-separator pt-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="text-sm wrap-break-word">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function MyIpAddress() {
  return (
    <ToolPage>
      <MyIpAddressContent />
    </ToolPage>
  );
}
