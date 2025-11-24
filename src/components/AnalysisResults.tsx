import React, { useMemo } from 'react';
import { MigrationAnalysis, IdentityType } from '../types';
import { UserIcon, GroupIcon, AppIcon, UnknownIcon, AlertTriangleIcon, CheckCircleIcon, ShieldCheckIcon } from './Icons';
import { PermissionVisualizer } from './PermissionVisualizer';
import { CoverageBanner } from './CoverageBanner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AnalysisResultsProps {
    results: MigrationAnalysis[];
    selectedRoles: Record<string, number>;
    setSelectedRoles: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    resolvedNames: Record<string, { name: string, type: IdentityType }>;
    theme: 'light' | 'dark';
}

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({
    results,
    selectedRoles,
    setSelectedRoles,
    resolvedNames,
    theme
}) => {

    // Grouping Logic - STRICT ORDER: Apps -> Groups -> Users -> Unknown
    const groupedResults = useMemo(() => {
        const groups: Record<string, MigrationAnalysis[]> = {
            'Application': [],
            'ServicePrincipal': [],
            'Group': [],
            'User': [],
            'Unknown': []
        };

        results.forEach(res => {
            const id = res.originalPolicy.objectId;
            // Priority: Resolved Type (Graph) -> Cached Type (ARM) -> 'Unknown'
            let type = resolvedNames[id]?.type || res.originalPolicy.type || 'Unknown';

            if (groups[type]) {
                groups[type].push(res);
            } else {
                groups['Unknown'].push(res);
            }
        });

        return groups;
    }, [results, resolvedNames]);

    const activeData = results.map(r => {
        const selectedIdx = selectedRoles[r.originalPolicy.objectId] || 0;
        const rec = r.recommendations[selectedIdx];
        const resolvedInfo = resolvedNames[r.originalPolicy.objectId];
        const displayName = resolvedInfo?.name || r.originalPolicy.displayName;

        return {
            name: displayName || r.originalPolicy.objectId.substring(0, 8),
            confidence: rec?.confidence || 0,
            missing: rec?.missingPermissions.length || 0,
            excess: rec?.excessPermissions.length || 0,
            role: rec?.roleName || 'None',
            strategy: rec?.strategy
        };
    });

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-3 rounded shadow-fluent text-xs z-50 max-w-[250px]">
                    <p className="font-bold text-neutral-900 dark:text-white mb-2 truncate">{label}</p>
                    <div className="space-y-1">
                        <p className="text-neutral-700 dark:text-neutral-300">
                            Strategy: <span className="font-semibold text-brand-600 dark:text-brand-400">{data.strategy}</span>
                        </p>
                        <p className="text-neutral-700 dark:text-neutral-300">
                            Confidence: <span className={`font-semibold ${data.confidence > 80 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{data.confidence}%</span>
                        </p>
                        <p className="text-neutral-700 dark:text-neutral-300">
                            Role: <span className="font-mono text-[10px]">{data.role}</span>
                        </p>
                        {data.missing > 0 && (
                            <p className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                <AlertTriangleIcon className="w-3 h-3" /> {data.missing} Missing
                            </p>
                        )}
                        {data.excess > 0 && (
                            <p className="text-amber-600 dark:text-amber-400">
                                + {data.excess} Excess
                            </p>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    const [showSuggestions, setShowSuggestions] = React.useState<Record<string, boolean>>({});
    const [showCoverageDetails, setShowCoverageDetails] = React.useState<Record<string, boolean>>({});

    const toggleSuggestion = (id: string) => {
        setShowSuggestions(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const toggleCoverageDetails = (id: string) => {
        setShowCoverageDetails(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const renderIdentityGroup = (title: string, groupData: MigrationAnalysis[], icon: React.ReactNode) => {
        if (groupData.length === 0) return null;
        return (
            <React.Fragment>
                <div className="px-6 py-2 bg-neutral-100 dark:bg-neutral-900 border-y border-neutral-200 dark:border-neutral-700 font-semibold text-xs text-neutral-800 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-2 sticky top-0 z-10">
                    {icon}
                    {title} <span className="ml-1 opacity-60">({groupData.length})</span>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {groupData.map((res, idx) => {
                        const selectedRoleIdx = selectedRoles[res.originalPolicy.objectId] || 0;
                        const activeRec = res.recommendations[selectedRoleIdx];

                        const resolvedInfo = resolvedNames[res.originalPolicy.objectId];
                        const displayName = resolvedInfo?.name || res.originalPolicy.displayName;
                        // Use the type from graph resolution if available, else fallback to ARM info
                        const currentType = resolvedInfo?.type || res.originalPolicy.type;
                        const isKnown = !!displayName;
                        const isFullyCovered = res.existingCoverage?.isFullyCovered;
                        const showRecs = !isFullyCovered || showSuggestions[res.originalPolicy.objectId];
                        const showDetails = showCoverageDetails[res.originalPolicy.objectId];

                        return (
                            <div key={res.originalPolicy.objectId} className="group hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                <div className="grid grid-cols-12 gap-4 px-6 py-4 items-start">
                                    {/* Identity Column */}
                                    <div className="col-span-3 pr-2">
                                        <div className="flex items-start gap-2">
                                            <div className={`mt-0.5 w-6 h-6 rounded flex items-center justify-center shrink-0 ${isKnown ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
                                                }`}>
                                                {currentType === 'User' && <UserIcon className="w-4 h-4" />}
                                                {currentType === 'Group' && <GroupIcon className="w-4 h-4" />}
                                                {(currentType === 'ServicePrincipal' || currentType === 'Application') && <AppIcon className="w-4 h-4" />}
                                                {currentType === 'Unknown' && <UnknownIcon className="w-4 h-4" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                {isKnown ? (
                                                    <div className="font-medium text-sm text-neutral-900 dark:text-white break-words">
                                                        {displayName}
                                                    </div>
                                                ) : (
                                                    <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 break-all">
                                                        {res.originalPolicy.objectId}
                                                    </div>
                                                )}

                                                {/* Show Object ID in smaller font if we have a name */}
                                                {displayName && displayName !== res.originalPolicy.objectId && (
                                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-500 font-mono mt-0.5 truncate">{res.originalPolicy.objectId}</div>
                                                )}

                                                {/* Details about Type and AppID if available */}
                                                <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mt-1 flex flex-col gap-0.5">
                                                    {res.originalPolicy.applicationId && (
                                                        <span title="Application ID">App ID: {res.originalPolicy.applicationId}</span>
                                                    )}
                                                    {currentType !== 'Unknown' && (
                                                        <span className="opacity-75">{currentType}</span>
                                                    )}
                                                </div>

                                                {/* Existing Coverage Badge */}
                                                {res.existingCoverage && res.existingCoverage.isFullyCovered && (
                                                    <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium border border-green-200 dark:border-green-800">
                                                        <CheckCircleIcon className="w-3 h-3" />
                                                        Already Covered
                                                    </div>
                                                )}
                                                {res.existingCoverage && !res.existingCoverage.isFullyCovered && res.existingCoverage.coveredPermissions.length > 0 && (
                                                    <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] font-medium border border-blue-100 dark:border-blue-800">
                                                        <ShieldCheckIcon className="w-3 h-3" />
                                                        Partially Covered
                                                    </div>
                                                )}

                                                {/* Fallback message if resolution fails completely and no other info */}
                                                {!isKnown && !res.originalPolicy.applicationId && (
                                                    <div className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">Resolution Failed</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Recommendations Column */}
                                    <div className="col-span-4">
                                        {/* Selection Tabs for Strategies */}
                                        {res.recommendations.length > 0 && (
                                            <div className={`flex flex-wrap gap-2 mb-3 ${!showRecs ? 'opacity-50 grayscale' : ''}`}>
                                                {res.recommendations.map((rec, recIdx) => (
                                                    <button
                                                        key={recIdx}
                                                        onClick={() => setSelectedRoles(prev => ({ ...prev, [res.originalPolicy.objectId]: recIdx }))}
                                                        disabled={!showRecs}
                                                        className={`px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wide border transition-all ${selectedRoleIdx === recIdx
                                                            ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/20 dark:border-brand-800 dark:text-brand-300'
                                                            : 'bg-white border-neutral-200 text-neutral-500 hover:border-brand-300 hover:text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                                                            }`}
                                                        title={rec.reasoning}
                                                    >
                                                        {rec.strategy}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Active Role Display */}
                                        <div className={`flex flex-wrap gap-1.5 mb-2 ${!showRecs ? 'opacity-50' : ''}`}>
                                            {activeRec.roleNames && activeRec.roleNames.length > 0 ? (
                                                activeRec.roleNames.map((roleName, rIdx) => (
                                                    <span key={rIdx} className="inline-flex items-center px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                                        {roleName}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">{activeRec.roleName}</span>
                                            )}
                                        </div>

                                        <div className={`text-xs text-neutral-700 dark:text-neutral-400 line-clamp-3 group-hover:line-clamp-none transition-all ${!showRecs ? 'opacity-50' : ''}`}>
                                            {activeRec.reasoning}
                                        </div>
                                    </div>

                                    {/* Confidence */}
                                    <div className="col-span-2 text-right">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${activeRec.confidence > 80 ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20' :
                                            activeRec.confidence > 50 ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' :
                                                'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
                                            }`}>
                                            {activeRec.confidence}%
                                        </span>
                                    </div>

                                    {/* Gaps Analysis */}
                                    <div className="col-span-3">
                                        <div className="flex flex-col gap-1">
                                            {res.existingCoverage && (
                                                <CoverageBanner
                                                    existingCoverage={res.existingCoverage}
                                                    objectId={res.originalPolicy.objectId}
                                                    showDetails={showDetails}
                                                    onToggleDetails={toggleCoverageDetails}
                                                    showSuggestions={showSuggestions[res.originalPolicy.objectId]}
                                                    onToggleSuggestions={toggleSuggestion}
                                                />
                                            )}

                                            {activeRec.missingPermissions.length === 0 && !res.existingCoverage?.isFullyCovered && (
                                                <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 text-xs font-semibold mb-1">
                                                    <CheckCircleIcon className="w-3.5 h-3.5" />
                                                    <span>Complete Coverage</span>
                                                </div>
                                            )}

                                            {showRecs && (
                                                <PermissionVisualizer
                                                    breakdown={activeRec.roleBreakdown || []}
                                                    missing={activeRec.missingPermissions}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </React.Fragment>
        );
    };

    return (
        <div className="space-y-8 fade-in-up">

            {/* Overview Charts */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3 bg-neutral-50 dark:bg-neutral-900/30 p-4 rounded border border-neutral-200 dark:border-neutral-700" style={{ height: '392px' }}>
                    <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider mb-4">Confidence Distribution</h4>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activeData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.3} />
                            <XAxis
                                dataKey="name"
                                stroke="#9ca3af"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                interval={0}
                                angle={activeData.length > 10 ? -45 : 0}
                                textAnchor={activeData.length > 10 ? "end" : "middle"}
                                height={activeData.length > 10 ? 80 : 30}
                                tickFormatter={(value) => value.length > 12 ? `${value.substring(0, 12)}...` : value}
                            />
                            <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                            <Tooltip
                                content={<CustomTooltip />}
                                cursor={{ fill: theme === 'dark' ? '#374151' : '#e5e7eb', opacity: 0.2 }}
                            />
                            <Bar dataKey="confidence" radius={[2, 2, 0, 0]} barSize={activeData.length > 15 ? 20 : 30}>
                                {activeData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.confidence > 85 ? '#107c10' : entry.confidence > 60 ? '#ffaa44' : '#d13438'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>


                <div className="md:col-span-1 space-y-4">
                    <div className="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                        <div className="text-3xl font-light text-neutral-900 dark:text-white">
                            {Math.round(activeData.reduce((acc, curr) => acc + curr.confidence, 0) / (activeData.length || 1))}%
                        </div>
                        <div className="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">Average Confidence Score</div>
                    </div>
                    <div className="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                        <div className="text-3xl font-light text-neutral-900 dark:text-white">
                            {activeData.reduce((acc, curr) => acc + curr.missing, 0)}
                        </div>
                        <div className="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">Total Missing Permissions</div>
                    </div>
                    <div className="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                        <div className="text-3xl font-light text-neutral-900 dark:text-white">
                            {activeData.reduce((acc, curr) => acc + curr.excess, 0)}
                        </div>
                        <div className="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">Total Excess Permissions</div>
                    </div>
                </div>
            </div>

            {/* Detailed List */}
            <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Identity Mapping</h3>
                <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider">
                        <div className="col-span-3">Identity</div>
                        <div className="col-span-4">Recommended Role Combination</div>
                        <div className="col-span-2 text-right">Confidence</div>
                        <div className="col-span-3">Gap Analysis</div>
                    </div>

                    {/* Render Groups Ordered: Apps, Groups, Users, Unknown */}
                    {renderIdentityGroup('Applications & Service Principals', [...groupedResults['Application'], ...groupedResults['ServicePrincipal']], <AppIcon className="w-4 h-4" />)}
                    {renderIdentityGroup('Groups', groupedResults['Group'], <GroupIcon className="w-4 h-4" />)}
                    {renderIdentityGroup('Users', groupedResults['User'], <UserIcon className="w-4 h-4" />)}
                    {renderIdentityGroup('Unknown Identities', groupedResults['Unknown'], <UnknownIcon className="w-4 h-4" />)}

                </div>
            </div>

        </div>
    );
};
