import { MigrationAnalysis, ExistingCoverageResult, RoleBreakdown } from '../types';
import { getPolicyKey } from '../identity/policyKey';
import {
  ResolvedNames,
  describeIdentity,
  identityIconKind,
  isCompoundIdentity,
  resolveIdentityType,
  shouldShowObjectIdSeparately,
} from '../identity/identity';
import {
  groupResultsByType,
  flattenInDisplayOrder,
  toCoverageChartData,
  collectDisplayGroup,
  CoverageChartDatum,
  IDENTITY_DISPLAY_GROUPS,
} from '../identity/grouping';
import { formatPermissionLabel } from '../presentation/permissionFormat';
import {
  PERMISSION_VISIBLE_LIMIT,
  PermissionBadgeVariant,
  orderPermissionsForDisplay,
  permissionBadgeDescriptor,
  roleBreakdownCanExpand,
} from '../presentation/permissionDisplay';
import {
  CHART_BAR_GAP,
  CHART_BAR_WIDTH,
  CHART_BAND,
  activeCoverageSegments,
  coverageGroupWidth,
  coverageLabelPlacement,
  coverageOverviewStats,
} from '../presentation/chartPresentation';
import {
  confidenceLevel,
  coverageBannerKind,
  existingCoverageBadge,
  roleMatchesToBreakdown,
  showsCompleteCoverage,
} from '../presentation/resultPresentation';

/**
 * Builds a single, fully self-contained HTML document (HTML + CSS + JS + SVG icons
 * all inlined, no external assets, no React/recharts runtime) that recreates the
 * Key Vault analysis view so it can be shared with a colleague. Embeds every
 * identity, object id, application id, suggested role (per strategy), confidence,
 * and covered/missing/excess permission, plus existing-coverage information.
 *
 * Rendering is bespoke (HTML strings + inline SVG/CSS), but every *decision* about
 * what to show — permission ordering/limits, confidence tiers, coverage badges and
 * banners, identity icons, and section grouping — is delegated to the same shared
 * helpers the live React view uses, so the two can't drift apart.
 */

// HTML-escape any dynamic string so identity names, role names, permissions and ids
// can never break the markup or inject scripts into the shared file.
const esc = (value: string | number | undefined | null): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ICON_PATHS: Record<string, string> = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  group:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  app:
    '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  compound:
    '<rect x="2" y="3" width="8" height="6" rx="1"/><rect x="14" y="3" width="8" height="6" rx="1"/><rect x="8" y="15" width="8" height="6" rx="1"/><path d="M6 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9"/><line x1="12" y1="13" x2="12" y2="15"/>',
  unknown:
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  check:
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  shield:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  sun:
    '<circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  vault:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/>',
};

const iconSvg = (name: string, cls = ''): string =>
  `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;

// Map the shared badge variant to the export's CSS class (the live view maps the
// same variant to Tailwind classes instead).
const CSS_BADGE_CLASS: Record<PermissionBadgeVariant, string> = {
  missing: 'pv-missing',
  covered: 'pv-covered',
  excess: 'pv-excess',
  'excess-priv': 'pv-excess-priv',
};

// Render a list of permission badges, mirroring the live visualizer: excess items
// are sorted with privileged (purge/release) ops first, and anything beyond the
// visible limit is emitted as collapsible `.pv-extra` markup.
const renderBadges = (perms: string[], kind: 'missing' | 'covered' | 'excess'): string => {
  if (perms.length === 0) return '';

  const list = orderPermissionsForDisplay(perms, kind);

  const badges = list.map((p, i) => {
    const extra = i >= PERMISSION_VISIBLE_LIMIT ? ' pv-extra' : '';
    const desc = permissionBadgeDescriptor(p, kind);
    const cls = `pv-badge ${CSS_BADGE_CLASS[desc.variant]}`;

    const title = desc.privileged ? 'This is a privileged operation' : p;
    const prefix = desc.leadingAlert ? iconSvg('alert', 'pv-ic') : desc.plusPrefix ? '+ ' : '';
    const suffix = desc.trailingAlert ? iconSvg('alert', 'pv-ic') : '';

    return `<span class="${cls}${extra}" title="${esc(title)}">${prefix}${esc(formatPermissionLabel(p))}${suffix}</span>`;
  });

  if (list.length > PERMISSION_VISIBLE_LIMIT) {
    badges.push(`<span class="pv-more">+${list.length - PERMISSION_VISIBLE_LIMIT} more...</span>`);
  }

  return badges.join('');
};

const renderVisualizer = (
  breakdown: RoleBreakdown[],
  missing: string[],
  keyBase: string
): string => {
  const blocks: string[] = [];

  if (missing.length > 0) {
    const id = `m-${keyBase}`;
    const toggle =
      missing.length > PERMISSION_VISIBLE_LIMIT
        ? `<button class="pv-toggle" data-action="expand" data-target="${id}" data-more="Show All" data-less="Show Less">Show All</button>`
        : '';
    blocks.push(
      `<div class="pv-block" id="${id}"><div class="pv-head"><span class="pv-label pv-label-missing">Missing Permissions</span>${toggle}</div><div class="pv-list">${renderBadges(missing, 'missing')}</div></div>`
    );
  }

  breakdown.forEach((role, ri) => {
    const id = `r-${keyBase}-${ri}`;
    const toggle = roleBreakdownCanExpand(role)
      ? `<button class="pv-toggle" data-action="expand" data-target="${id}" data-more="Show All" data-less="Show Less">Show All</button>`
      : '';
    const covered =
      role.covered.length > 0 ? `<div class="pv-list">${renderBadges(role.covered, 'covered')}</div>` : '';
    const excess =
      role.excess.length > 0 ? `<div class="pv-list">${renderBadges(role.excess, 'excess')}</div>` : '';

    blocks.push(
      `<div class="pv-block pv-role" id="${id}"><div class="pv-head"><span class="pv-role-name">${esc(role.roleName)}</span>${toggle}</div>${covered}${excess}</div>`
    );
  });

  return `<div class="pv">${blocks.join('')}</div>`;
};

const renderCoverageBanner = (
  coverage: ExistingCoverageResult | undefined,
  keyBase: string
): string => {
  const kind = coverageBannerKind(coverage);
  if (kind === 'none' || !coverage) return '';

  const id = `cb-${keyBase}`;
  const breakdown = roleMatchesToBreakdown(coverage);

  if (kind === 'full') {
    const details =
      coverage.roleMatches.length > 0
        ? `<div class="banner-sub">Direct-Principal Assignments Coverage</div>${renderVisualizer(
            breakdown,
            [],
            `covfull-${keyBase}`
          )}`
        : '';
    return `<div class="banner banner-green"><div class="banner-title">${iconSvg('check', 'bic')} Fully Covered by Direct-Principal RBAC Assignments</div><div class="collapsible" id="${id}">${details}</div><button class="banner-toggle banner-toggle-green" data-action="toggle" data-target="${id}" data-more="Show Details" data-less="Hide Details">Show Details</button></div>`;
  }

  const details = `<div class="banner-sub">Direct-Principal Assignments Coverage</div>${renderVisualizer(
    breakdown,
    coverage.missingPermissions,
    `covpart-${keyBase}`
  )}`;
  return `<div class="banner banner-blue"><div class="banner-title">${iconSvg('shield', 'bic')} Partially Covered by Direct-Principal RBAC Assignments</div><div class="collapsible" id="${id}">${details}</div><button class="banner-toggle banner-toggle-blue" data-action="toggle" data-target="${id}" data-more="Show Details" data-less="Hide Details">Show Details</button></div>`;
};

const renderLegacyPolicy = (
  permissions: MigrationAnalysis['originalPolicy']['permissions'],
  rowId: string
): string => {
  const cats = Object.entries(permissions)
    .filter(([, perms]) => Array.isArray(perms) && perms.length > 0)
    .map(([category, perms]) => {
      const chips = (perms as string[])
        .map((p) => `<span class="lp-perm">${esc(p)}</span>`)
        .join('');
      return `<div class="lp-cat"><span class="lp-cat-name">${esc(category)}:</span><div class="lp-perms">${chips}</div></div>`;
    })
    .join('');

  return `<div class="collapsible legacy" id="lp-${rowId}">${cats || '<span class="lp-empty">No legacy permissions.</span>'}</div>`;
};

const selectedStrategyIndex = (res: MigrationAnalysis, selectedRoles: Record<string, number>): number => {
  const index = selectedRoles[getPolicyKey(res.originalPolicy)] || 0;
  return res.recommendations[index] ? index : 0;
};

const renderIdentityCard = (
  res: MigrationAnalysis,
  resolvedNames: ResolvedNames,
  selectedRoles: Record<string, number>,
  rowId: string
): string => {
  const policy = res.originalPolicy;
  const { displayName } = describeIdentity(policy, resolvedNames);
  const isKnown = !!displayName;
  const compound = isCompoundIdentity(policy);
  const currentType = resolveIdentityType(policy, resolvedNames);
  const coverage = res.existingCoverage;

  const selectedIdx = selectedStrategyIndex(res, selectedRoles);
  const recs = res.recommendations;

  // --- Identity column ---------------------------------------------------
  const nameMarkup = isKnown
    ? `<div class="id-name">${esc(displayName)}</div>`
    : `<div class="id-guid">${esc(policy.objectId)}</div>`;
  const subObjectId = shouldShowObjectIdSeparately(displayName, policy.objectId)
    ? `<div class="id-oid">${esc(policy.objectId)}</div>`
    : '';

  const metaBits: string[] = [];
  if (compound) {
    metaBits.push(`<span class="id-appid" title="Application ID">App ID: ${esc(policy.applicationId)}</span>`);
  }
  if (currentType !== 'Unknown') {
    metaBits.push(`<span class="id-type">${esc(currentType)}</span>`);
  }
  const meta = metaBits.length ? `<div class="id-meta">${metaBits.join('')}</div>` : '';

  const badge = existingCoverageBadge(coverage);
  const coverageBadge =
    badge === 'covered'
      ? `<div class="id-pill id-pill-green">${iconSvg('check', 'pic')} Already Covered (Direct Principal)</div>`
      : badge === 'partial'
        ? `<div class="id-pill id-pill-blue">${iconSvg('shield', 'pic')} Partially Covered (Direct Principal)</div>`
        : '';

  const resolutionFailed =
    !isKnown && !policy.applicationId ? '<div class="id-failed">Resolution Failed</div>' : '';
  const compoundWarning = compound
    ? `<div class="banner banner-warning"><div class="banner-title">${iconSvg('alert', 'bic')} Manual migration required</div>These permission-only recommendations cannot preserve the application restriction of a compound policy. PowerShell export skips this identity.</div>`
    : '';

  const identityCol = `<div class="col-identity">
      <div class="id-ico ${isKnown ? 'id-ico-known' : 'id-ico-unknown'}">${iconSvg(identityIconKind(compound, currentType), 'w4')}</div>
      <div class="id-main">
        ${nameMarkup}
        ${subObjectId}
        ${meta}
        ${coverageBadge}
        ${resolutionFailed}
        ${compoundWarning}
        <button class="link-toggle" data-action="toggle" data-target="lp-${rowId}" data-more="View Legacy Policy" data-less="Hide Legacy Policy">View Legacy Policy</button>
        ${renderLegacyPolicy(policy.permissions, rowId)}
      </div>
    </div>`;

  if (recs.length === 0) {
    return `<div class="id-row" data-row="${rowId}">
          ${identityCol}
          <div class="col-roles"><span class="no-rec">No recommendation available.</span></div>
          <div class="col-coverage"></div>
          <div class="col-gap">${renderCoverageBanner(coverage, rowId)}</div>
        </div>`;
  }

  // --- Strategy tabs (shared across the role/coverage/gap columns) --------
  const tabs = `<div class="tabs">${recs
    .map(
      (rec, i) =>
        `<button class="tab${i === selectedIdx ? ' tab-active' : ''}" data-action="tab" data-row="${rowId}" data-idx="${i}" title="${esc(rec.reasoning)}">${esc(rec.strategy)}</button>`
    )
    .join('')}</div>`;

  const hidden = (i: number) => (i === selectedIdx ? '' : ' hidden');

  const rolesPanels = recs
    .map((rec, i) => {
      const chips =
        rec.roleNames && rec.roleNames.length > 0
          ? rec.roleNames.map((rn) => `<span class="role-chip">${esc(rn)}</span>`).join('')
          : `<span class="role-name">${esc(rec.roleName)}</span>`;
      return `<div class="strat" data-row="${rowId}" data-idx="${i}"${hidden(i)}><div class="role-chips">${chips}</div><div class="reasoning">${esc(rec.reasoning)}</div></div>`;
    })
    .join('');

  const coveragePanels = recs
    .map(
      (rec, i) =>
        `<div class="strat" data-row="${rowId}" data-idx="${i}"${hidden(i)}><span class="conf conf-${confidenceLevel(rec.confidence)}">${rec.confidence}%</span></div>`
    )
    .join('');

  const gapPanels = recs
    .map((rec, i) => {
      const complete = showsCompleteCoverage(rec.missingPermissions.length, coverage)
        ? `<div class="complete">${iconSvg('check', 'w35')} Complete Coverage</div>`
        : '';
      return `<div class="strat" data-row="${rowId}" data-idx="${i}"${hidden(i)}>${complete}${renderVisualizer(
        rec.roleBreakdown || [],
        rec.missingPermissions,
        `${rowId}-${i}`
      )}</div>`;
    })
    .join('');

  return `<div class="id-row" data-row="${rowId}">
      ${identityCol}
      <div class="col-roles"><div class="mobile-col-label">Recommended Role Combination</div>${tabs}${rolesPanels}</div>
      <div class="col-coverage"><div class="mobile-col-label">Coverage</div>${coveragePanels}</div>
      <div class="col-gap"><div class="mobile-col-label">Gap Analysis</div>${renderCoverageBanner(coverage, rowId)}${gapPanels}</div>
    </div>`;
};

interface ReportChartRow {
  selectedIdx: number;
  strategies: CoverageChartDatum[];
}

const renderChart = (data: ReportChartRow[]): string => {
  const leftPad = 44;
  const topPad = 12;
  const plotH = 260;
  const bottomPad = 96;
  const band = CHART_BAND;
  const barW = CHART_BAR_WIDTH;
  const gap = CHART_BAR_GAP;

  const width = Math.max(leftPad + data.length * band + 20, 320);
  const height = topPad + plotH + bottomPad;
  const baseY = topPad + plotH;

  const parts: string[] = [];

  // Y gridlines + ticks
  [0, 25, 50, 75, 100].forEach((t) => {
    const y = baseY - (t / 100) * plotH;
    parts.push(
      `<line x1="${leftPad}" y1="${y}" x2="${width - 10}" y2="${y}" stroke="var(--chart-grid)" stroke-dasharray="3 3" />`
    );
    parts.push(
      `<text x="${leftPad - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--chart-axis)">${t}%</text>`
    );
  });

  data.forEach((row, i) => {
    const center = leftPad + i * band + band / 2;

    row.strategies.forEach((d, strategyIdx) => {
      parts.push(`<g class="chart-strat" data-row="row${i}" data-idx="${strategyIdx}" data-coverage="${esc(d.coveragePct)}" data-missing="${esc(d.rawMissing)}" data-excess="${esc(d.rawExcess)}"${strategyIdx === row.selectedIdx ? '' : ' hidden'}>`);
      parts.push(`<title>${esc(d.name)} — ${esc(d.strategy)}: ${esc(d.role)}</title>`);
      const metrics = activeCoverageSegments(d);
      const groupW = coverageGroupWidth(metrics.length);
      const startX = center - groupW / 2;

      metrics.forEach((m, j) => {
        const x = startX + j * (barW + gap);
        const h = (m.value / 100) * plotH;
        const y = baseY - h;
        parts.push(`<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${m.bar}" />`);

        const place = coverageLabelPlacement(x, y, h, barW);
        parts.push(
          `<text x="${place.x}" y="${place.y}" fill="${m.label}" stroke="${m.bar}" stroke-width="3" style="paint-order:stroke fill" font-size="12" font-weight="900" text-anchor="${place.anchor}" dominant-baseline="${place.baseline}" transform="rotate(-90, ${place.x}, ${place.y})">${m.value}%</text>`
        );
      });

      const label = d.name.length > 12 ? `${d.name.substring(0, 12)}...` : d.name;
      const lx = center;
      const ly = baseY + 14;
      parts.push(
        `<text x="${lx}" y="${ly}" text-anchor="end" font-size="10" fill="var(--chart-axis)" transform="rotate(-45, ${lx}, ${ly})">${esc(label)}</text>`
      );
      parts.push('</g>');
    });
  });

  return `<div class="chart-scroll"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Coverage distribution chart">${parts.join('')}</svg></div>`;
};

const renderOverview = (data: ReportChartRow[]): string => {
  const { avgCoverage: avg, totalMissing, totalExcess } = coverageOverviewStats(
    data.map((row) => row.strategies[row.selectedIdx])
  );

  return `<div class="overview">
      <div class="chart-card">
        <h4 class="chart-title">Coverage Distribution</h4>
        ${renderChart(data)}
      </div>
      <div class="stat-cards">
        <div class="stat-card"><div class="stat-value" id="stat-average">${avg}%</div><div class="stat-label">Average Coverage</div></div>
        <div class="stat-card"><div class="stat-value" id="stat-missing">${totalMissing}</div><div class="stat-label">Total Missing Permissions</div></div>
        <div class="stat-card"><div class="stat-value" id="stat-excess">${totalExcess}</div><div class="stat-label">Total Excess Permissions</div></div>
      </div>
    </div>`;
};

const STYLES = `
:root{
  --bg:#f3f2f1;--panel:#ffffff;--panel-alt:#faf9f8;--panel-head:#faf9f8;
  --border:#edebe9;--border-strong:#e1dfdd;--divider:#f3f2f1;
  --text:#201f1e;--text-soft:#605e5c;--text-mute:#8a8886;
  --brand-600:#106ebe;--brand-700:#005a9e;--brand-bg:#eff6fc;--brand-border:#c7e0f4;--brand-text:#005a9e;
  --chip-bg:#f3f2f1;--chip-border:#e1dfdd;--chip-text:#323130;
  --tab-bg:#ffffff;--tab-border:#edebe9;--tab-text:#8a8886;
  --appbar-bg:#323130;--appbar-text:#ffffff;
  --chart-grid:#e5e7eb;--chart-axis:#9ca3af;
  --shadow:0 1.6px 3.6px 0 rgba(0,0,0,.132),0 .3px .9px 0 rgba(0,0,0,.108);
}
html.dark{
  --bg:#201f1e;--panel:#323130;--panel-alt:rgba(32,31,30,.5);--panel-head:rgba(50,49,48,.5);
  --border:#605e5c;--border-strong:#605e5c;--divider:#3a3938;
  --text:#f3f2f1;--text-soft:#c8c6c4;--text-mute:#a19f9d;
  --brand-600:#2b88d8;--brand-700:#50e6ff;--brand-bg:rgba(0,69,120,.2);--brand-border:#005a9e;--brand-text:#c7e0f4;
  --chip-bg:#605e5c;--chip-border:#4a4847;--chip-text:#e1dfdd;
  --tab-bg:#323130;--tab-border:#605e5c;--tab-text:#a19f9d;
  --appbar-bg:#323130;--appbar-text:#ffffff;
  --chart-grid:#4b5563;--chart-axis:#9ca3af;
  --shadow:0 1.6px 3.6px 0 rgba(0,0,0,.4),0 .3px .9px 0 rgba(0,0,0,.3);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI","Segoe UI Web (West European)",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased;}
svg{display:inline-block;vertical-align:middle}
.w4{width:16px;height:16px}.w35{width:14px;height:14px}.pic{width:12px;height:12px}.bic{width:14px;height:14px}.pv-ic{width:12px;height:12px}.tic{width:16px;height:16px}
.appbar{background:var(--appbar-bg);color:var(--appbar-text);height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;position:sticky;top:0;z-index:50;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.appbar-left{display:flex;align-items:center;gap:12px}
.appbar-title{font-weight:600;font-size:16px;letter-spacing:-.01em}
.appbar-div{height:16px;width:1px;background:#605e5c}
.appbar-sub{font-size:13px;color:#d2d0ce}
.theme-btn{height:32px;width:32px;border:none;border-radius:4px;background:transparent;color:#d2d0ce;cursor:pointer;display:flex;align-items:center;justify-content:center}
.theme-btn:hover{background:rgba(255,255,255,.12)}
.container{max-width:1600px;margin:0 auto;padding:24px}
.workspace{background:var(--panel);border:1px solid var(--border);border-radius:4px;box-shadow:var(--shadow)}
.ws-head{padding:16px 24px;border-bottom:1px solid var(--border);background:var(--panel-head);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.ws-head h2{margin:0;font-size:18px;font-weight:600}
.ws-meta{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-soft)}
.ws-meta b{color:var(--text);font-weight:600}
.ws-body{padding:24px}
.overview{display:grid;grid-template-columns:3fr 1fr;gap:24px;align-items:stretch;margin-bottom:32px}
.chart-card{background:var(--panel-alt);border:1px solid var(--border);border-radius:4px;padding:16px;height:392px;overflow:hidden}
.chart-title{margin:0 0 16px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-soft)}
.chart-scroll{overflow-x:auto;overflow-y:hidden;height:calc(100% - 28px)}
.chart-scroll svg{display:block;margin:0 auto}
.stat-cards{display:flex;flex-direction:column;gap:16px}
.stat-card{background:var(--panel);border:1px solid var(--border);border-radius:4px;box-shadow:var(--shadow);padding:20px;flex:1;display:flex;flex-direction:column;justify-content:center}
.stat-value{font-size:30px;font-weight:300;line-height:1}
.stat-label{font-size:12px;color:var(--text-soft);margin-top:4px}
.mapping-title{font-size:18px;font-weight:600;margin:0 0 16px}
.mapping{border:1px solid var(--border);border-radius:4px;background:var(--panel);overflow:hidden}
.mapping-head,.id-row{display:grid;grid-template-columns:3fr 4fr 2fr 3fr;gap:16px}
.mapping-head{padding:12px 24px;background:var(--panel-head);border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em}
.mapping-head .mh-right{text-align:right}
.mobile-col-label{display:none}
.group-head{display:flex;align-items:center;gap:10px;padding:8px 24px;background:var(--panel-alt);border-top:1px solid var(--border);border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em}
.group-count{opacity:.6}
.id-row{padding:16px 24px;align-items:start;border-bottom:1px solid var(--divider)}
.id-row:last-child{border-bottom:none}
.col-identity{display:flex;gap:12px}
.id-ico{margin-top:2px;width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.id-ico-known{background:var(--brand-bg);color:var(--brand-600)}
.id-ico-unknown{background:var(--chip-bg);color:var(--text-soft)}
.id-main{min-width:0;flex:1}
.id-name{font-weight:600;font-size:14px;word-break:break-word}
.id-guid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--text-soft);background:var(--chip-bg);padding:2px 6px;border-radius:4px;border:1px solid var(--border);word-break:break-all;display:inline-block}
.id-oid{font-size:10px;color:var(--text-mute);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.id-meta{font-size:10px;color:var(--text-soft);margin-top:4px;display:flex;flex-direction:column;gap:2px}
.id-type{opacity:.75}
.id-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-top:8px}
.id-pill-green{background:#dff6dd;color:#0b6a0b;border:1px solid #a7e3a5}
.id-pill-blue{background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}
html.dark .id-pill-green{background:rgba(16,124,16,.15);color:#6ccb6c;border-color:#0b5a0b}
html.dark .id-pill-blue{background:rgba(30,64,175,.2);color:#93c5fd;border-color:#1e40af}
.id-failed{font-size:10px;color:#b7791f;margin-top:4px}
.link-toggle{display:block;margin-top:8px;background:none;border:none;padding:0;font-size:10px;font-weight:600;color:var(--brand-600);cursor:pointer}
.link-toggle:hover{text-decoration:underline}
.collapsible{display:none}
.collapsible.open{display:block}
.legacy{margin-top:8px;padding:8px;background:var(--panel-alt);border:1px solid var(--border);border-radius:4px;font-size:10px}
.lp-cat{margin-bottom:4px}
.lp-cat-name{font-weight:600;color:var(--text-soft);text-transform:capitalize}
.lp-perms{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.lp-perm{padding:1px 4px;background:var(--panel);border:1px solid var(--border);border-radius:3px;color:var(--text-soft)}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.tab{padding:4px 8px;border-radius:2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border:1px solid var(--tab-border);background:var(--tab-bg);color:var(--tab-text);cursor:pointer}
.tab:hover{color:var(--text)}
.tab-active{background:var(--brand-bg);border-color:var(--brand-border);color:var(--brand-text)}
.strat[hidden],.chart-strat[hidden]{display:none}
.role-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.role-chip{display:inline-flex;align-items:center;padding:4px 8px;border-radius:4px;background:var(--chip-bg);border:1px solid var(--chip-border);font-size:12px;font-weight:500;color:var(--chip-text)}
.role-name{font-weight:600;font-size:14px}
.reasoning{font-size:12px;color:var(--text-soft);line-height:1.5}
.no-rec{font-size:12px;color:var(--text-mute)}
.col-coverage{text-align:right}
.conf{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700}
.conf-high{color:#0b6a0b;background:#dff6dd}
.conf-mid{color:#8a6d3b;background:#fff4ce}
.conf-low{color:#a4262c;background:#fde7e9}
html.dark .conf-high{color:#6ccb6c;background:rgba(16,124,16,.18)}
html.dark .conf-mid{color:#fbbf24;background:rgba(120,53,15,.3)}
html.dark .conf-low{color:#f87171;background:rgba(127,29,29,.3)}
.complete{display:flex;align-items:center;gap:6px;color:#0b6a0b;font-size:12px;font-weight:600;margin-bottom:4px}
html.dark .complete{color:#6ccb6c}
.banner{padding:8px;border-radius:4px;font-size:12px;margin-bottom:8px}
.banner-green{background:#f0faef;border:1px solid #c5ebc3}
.banner-blue{background:#eff6ff;border:1px solid #cfe3ff}
.banner-warning{background:#fff4ce;border:1px solid #f6e2a6;color:#8a6d3b;margin-top:8px}
html.dark .banner-green{background:rgba(16,124,16,.12);border-color:#0b5a0b}
html.dark .banner-blue{background:rgba(30,64,175,.15);border-color:#1e40af}
html.dark .banner-warning{background:rgba(120,53,15,.3);border-color:#78350f;color:#fbbf24}
.banner-title{display:flex;align-items:center;gap:4px;font-weight:600;margin-bottom:6px}
.banner-green .banner-title{color:#0b6a0b}
.banner-blue .banner-title{color:#1e40af}
html.dark .banner-green .banner-title{color:#8fdc8d}
html.dark .banner-blue .banner-title{color:#93c5fd}
.banner-sub{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin:6px 0;color:var(--text-soft)}
.banner-toggle{display:block;width:100%;text-align:center;background:none;border:none;border-top:1px solid transparent;margin-top:6px;padding-top:4px;font-size:10px;font-weight:600;cursor:pointer}
.banner-toggle-green{color:#0b6a0b;border-top-color:#c5ebc3}
.banner-toggle-blue{color:#1e40af;border-top-color:#cfe3ff}
html.dark .banner-toggle-green{color:#8fdc8d;border-top-color:#0b5a0b}
html.dark .banner-toggle-blue{color:#93c5fd;border-top-color:#1e40af}
.pv{display:flex;flex-direction:column;gap:12px;margin-top:8px}
.pv-block.pv-role{padding-left:12px;border-left:2px solid var(--border)}
.pv-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px}
.pv-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.pv-label-missing{color:#a4262c}
html.dark .pv-label-missing{color:#f87171}
.pv-role-name{font-size:12px;font-weight:700;color:var(--text)}
.pv-toggle{background:none;border:none;padding:0;font-size:10px;color:var(--brand-600);cursor:pointer}
.pv-toggle:hover{text-decoration:underline}
.pv-list{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.pv-badge{display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:2px;font-size:10px;font-weight:600;border:1px solid;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv-missing{background:#fde7e9;color:#a4262c;border-color:#f3bcc2}
.pv-covered{background:#dff6dd;color:#0b6a0b;border-color:#a7e3a5}
.pv-excess{background:#fff4ce;color:#8a6d3b;border-color:#f6e2a6}
.pv-excess-priv{background:#fce4b6;color:#7a5a16;border-color:#eac46a}
html.dark .pv-missing{background:rgba(127,29,29,.3);color:#f87171;border-color:#7f1d1d}
html.dark .pv-covered{background:rgba(16,124,16,.3);color:#6ccb6c;border-color:#14532d}
html.dark .pv-excess{background:rgba(120,53,15,.3);color:#fbbf24;border-color:#78350f}
html.dark .pv-excess-priv{background:rgba(120,53,15,.6);color:#fde68a;border-color:#b45309}
.pv-extra{display:none}
.pv-block.expanded .pv-extra{display:inline-flex}
.pv-more{font-size:10px;color:var(--text-mute);font-style:italic;padding-left:4px;align-self:center}
.pv-block.expanded .pv-more{display:none}
.footer{text-align:center;font-size:11px;color:var(--text-mute);padding:16px 0 4px}
.coverage-note{font-size:12px;color:var(--text-soft);margin:0 0 16px}
@media(max-width:1199px){
  .mapping-head{display:none}
  .id-row{grid-template-columns:1fr;gap:20px}
  .col-roles,.col-coverage,.col-gap{min-width:0;border-top:1px solid var(--border);padding-top:16px;text-align:left}
  .mobile-col-label{display:block;margin-bottom:8px;font-size:10px;font-weight:600;color:var(--text-mute);text-transform:uppercase;letter-spacing:.06em}
}
@media(max-width:900px){
  .overview{grid-template-columns:1fr;gap:16px}
  .stat-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .stat-card{min-height:96px;padding:16px}
}
@media(max-width:639px){
  .appbar{padding:0 12px}
  .appbar-left{gap:8px}
  .appbar-title{font-size:14px}
  .appbar-div,.appbar-sub{display:none}
  .container{padding:12px}
  .ws-head{align-items:flex-start;padding:16px}
  .ws-head h2,.ws-meta b{overflow-wrap:anywhere}
  .ws-meta{flex-direction:column;gap:4px}
  .ws-body{padding:16px}
  .chart-card{height:340px;padding:12px}
  .stat-cards{grid-template-columns:1fr}
  .mapping-title{margin-bottom:12px}
  .group-head,.id-row{padding-left:16px;padding-right:16px}
  .id-oid{white-space:normal;word-break:break-all}
  .id-meta,.role-chip{max-width:100%;overflow-wrap:anywhere}
}
`;

const buildScript = (): string => {
  const sun = JSON.stringify(iconSvg('sun', 'tic'));
  const moon = JSON.stringify(iconSvg('moon', 'tic'));
  return [
    '(function(){',
    'var SUN=' + sun + ';var MOON=' + moon + ';',
    'var root=document.documentElement;',
    'function updateOverview(){',
    'var bars=document.querySelectorAll(\'.chart-strat:not([hidden])\'),coverage=0,missing=0,excess=0;',
    "for(var i=0;i<bars.length;i++){coverage+=Number(bars[i].getAttribute('data-coverage'));missing+=Number(bars[i].getAttribute('data-missing'));excess+=Number(bars[i].getAttribute('data-excess'));}",
    "document.getElementById('stat-average').textContent=Math.round(coverage/(bars.length||1))+'%';",
    "document.getElementById('stat-missing').textContent=String(missing);",
    "document.getElementById('stat-excess').textContent=String(excess);",
    '}',
    "document.addEventListener('click',function(e){",
    "var t=e.target.closest('[data-action]');if(!t)return;",
    "var a=t.getAttribute('data-action');",
    "if(a==='theme'){var d=root.classList.toggle('dark');t.innerHTML=d?SUN:MOON;t.setAttribute('title',d?'Switch to light mode':'Switch to dark mode');return;}",
    "if(a==='tab'){var row=t.getAttribute('data-row'),idx=t.getAttribute('data-idx');",
    "var ss=document.querySelectorAll('.strat[data-row=\"'+row+'\"],.chart-strat[data-row=\"'+row+'\"]');",
    "for(var i=0;i<ss.length;i++){ss[i].toggleAttribute('hidden',ss[i].getAttribute('data-idx')!==idx);}",
    "var tabs=t.parentNode.querySelectorAll('.tab');",
    "for(var j=0;j<tabs.length;j++){tabs[j].classList.toggle('tab-active',tabs[j]===t);}updateOverview();return;}",
    "var el=document.getElementById(t.getAttribute('data-target'));if(!el)return;",
    "if(a==='toggle'){var o=el.classList.toggle('open');t.textContent=o?t.getAttribute('data-less'):t.getAttribute('data-more');return;}",
    "if(a==='expand'){var x=el.classList.toggle('expanded');t.textContent=x?t.getAttribute('data-less'):t.getAttribute('data-more');return;}",
    '});})();',
  ].join('');
};

export const exportToHtml = (
  results: MigrationAnalysis[],
  selectedRoles: Record<string, number>,
  resolvedNames: ResolvedNames,
  theme: 'light' | 'dark',
  vaultName: string,
  subscriptionId: string,
  generatedAt: Date = new Date()
): string => {
  const grouped = groupResultsByType(results, resolvedNames);
  const ordered = flattenInDisplayOrder(grouped);
  // Pre-render every strategy with shared chart helpers; the standalone script only switches visibility.
  const chartData: ReportChartRow[] = ordered.map((res) => {
    const key = getPolicyKey(res.originalPolicy);
    return {
      selectedIdx: selectedStrategyIndex(res, selectedRoles),
      strategies: res.recommendations.length
        ? res.recommendations.map((_, i) => toCoverageChartData([res], { [key]: i }, resolvedNames)[0])
        : toCoverageChartData([res], {}, resolvedNames),
    };
  });

  const groupDefs = IDENTITY_DISPLAY_GROUPS.map((group) => ({
    label: group.label,
    icon: group.iconKind,
    items: collectDisplayGroup(grouped, group),
  }));

  let rowSeq = 0;
  const groupsHtml = groupDefs
    .filter((g) => g.items.length > 0)
    .map((g) => {
      const cards = g.items
        .map((res) =>
          renderIdentityCard(res, resolvedNames, selectedRoles, `row${rowSeq++}`)
        )
        .join('');
      return `<div class="group-head">${iconSvg(g.icon, 'w4')} ${esc(g.label)} <span class="group-count">(${g.items.length})</span></div><div class="group-body">${cards}</div>`;
    })
    .join('');

  const mappingBody =
    results.length === 0
      ? '<div class="id-row"><div class="no-rec">No identities selected for export.</div></div>'
      : groupsHtml;

  const themeBtn =
    theme === 'dark'
      ? `<button class="theme-btn" data-action="theme" title="Switch to light mode">${iconSvg('sun', 'tic')}</button>`
      : `<button class="theme-btn" data-action="theme" title="Switch to dark mode">${iconSvg('moon', 'tic')}</button>`;

  return `<!DOCTYPE html>
<html lang="en" class="${theme === 'dark' ? 'dark' : ''}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Key Vault RBAC Analysis - ${esc(vaultName)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="appbar">
  <div class="appbar-left">
    ${iconSvg('vault', 'tic')}
    <span class="appbar-title">Key Vault Migrator</span>
    <span class="appbar-div"></span>
    <span class="appbar-sub">RBAC Analysis Report</span>
  </div>
  ${themeBtn}
</div>
<div class="container">
  <div class="workspace">
    <div class="ws-head">
      <h2>Analysis: ${esc(vaultName)}</h2>
      <div class="ws-meta">
        <span>Subscription: <b>${esc(subscriptionId || 'N/A')}</b></span>
        <span>Identities: <b>${results.length}</b></span>
        <span>Generated: <b>${esc(generatedAt.toLocaleString())}</b></span>
      </div>
    </div>
    <div class="ws-body">
      ${renderOverview(chartData)}
      <p class="coverage-note">Existing coverage reflects direct-principal role assignments only. Group membership and management-group effective access are not calculated.</p>
      <div>
        <h3 class="mapping-title">Identity Mapping</h3>
        <div class="mapping">
          <div class="mapping-head">
            <div>Identity</div>
            <div>Recommended Role Combination</div>
            <div class="mh-right">Coverage</div>
            <div>Gap Analysis</div>
          </div>
          ${mappingBody}
        </div>
      </div>
    </div>
  </div>
  <div class="footer">Generated by Azure Key Vault RBAC Migrator &middot; ${esc(generatedAt.toISOString())}</div>
</div>
<script>${buildScript()}</script>
</body>
</html>`;
};
