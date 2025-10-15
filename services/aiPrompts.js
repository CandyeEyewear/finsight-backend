// backend/services/aiPrompts.js

const { currencyFmtMM, numFmt, pctFmt } = require('../utils/formatters'); // Your formatting functions

function buildPrompt(section, data) {
  const { modelSummary, projections, params, historicalData, ccy } = data;
  const base = projections?.base || {};
  const minDSCR = base.creditStats?.minDSCR || 0;
  const maxLeverage = base.creditStats?.maxLeverage || 0;
  const minICR = base.creditStats?.minICR || 0;
  
  const prompts = {
        executiveSummary: `You are writing for a Credit Committee comprising senior executives who will approve or decline this transaction. Write a 3-paragraph executive summary in formal investment banking style:

PARAGRAPH 1: Transaction Overview
- Borrower name, industry, transaction size, and purpose
- Use precise financial terminology (e.g., "senior secured term facility" not "loan")

PARAGRAPH 2: Credit Assessment
- Lead with credit metrics: DSCR ${numFmt(minDSCR)}x, Leverage ${numFmt(maxLeverage)}x, ICR ${numFmt(minICR)}x
- Quantify covenant cushions (e.g., "DSCR covenant of ${numFmt(params.minDSCR || 1.2)}x provides ${numFmt(minDSCR - (params.minDSCR || 1.2))}x cushion")
- State collateral coverage explicitly

PARAGRAPH 3: Risk Summary & Recommendation
- Identify 2-3 material risks with quantified impact where possible
- State clear recommendation: APPROVE / APPROVE WITH CONDITIONS / DECLINE
- One-sentence rationale for recommendation

TONE: Formal, decisive, data-driven. Avoid hedging language. Use present tense for facts, future tense for projections.
DO NOT use markdown formatting (**, ##, etc.) - use plain text only.
Maximum 400 words.`,

        historicalPerformance: `Analyze the borrower's historical financial performance for Credit Committee review:

PERFORMANCE TRACK RECORD:
${historicalData && historicalData.length > 0 ? 
  `Historical data available for ${historicalData.length} years
Revenue CAGR: ${calculateCAGR(historicalData, 'revenue')}%
Recent revenue: ${historicalData.slice(-3).map(y => `${y.year}: ${currencyFmtMM(y.revenue || 0, ccy)}`).join(', ')}` 
  : "CRITICAL GAP: No historical data provided - recommend obtaining 3-5 years of historical financials before credit decision"}

QUALITY OF EARNINGS ASSESSMENT:
- Evaluate revenue sustainability and concentration
- Identify one-time items or non-recurring charges
- Assess working capital trends (if data available)
- Analyze historical volatility of cash flows

MANAGEMENT CREDIBILITY:
- Have they demonstrated ability to execute? (Track record)
- Conservative vs. aggressive assumptions in projections?
- Historical covenant compliance record

CONCLUSION: Rate historical performance as Strong/Acceptable/Weak/Insufficient Data with specific supporting evidence.

TONE: Analytical and objective. Flag data gaps prominently.
DO NOT use markdown formatting - plain text only.
Maximum 400 words.`,

        industryBenchmarking: `Provide industry and peer benchmarking analysis for Credit Committee:

INDUSTRY CONTEXT:
Industry: ${params.industry}
Based on typical industry metrics (use general knowledge for ${params.industry} sector):
- Typical industry leverage range
- Typical EBITDA margins
- Industry growth outlook and cyclicality
- Key industry risks

BORROWER RELATIVE TO INDUSTRY:
- Leverage: ${numFmt(maxLeverage)}x vs. industry typical range
- EBITDA Margin: ${pctFmt((base.rows?.[0]?.ebitda || 0) / (base.rows?.[0]?.revenue || 1))} vs. industry average
- Growth expectations vs. industry trends

COMPETITIVE POSITION:
- Market position (leader/follower based on provided data)
- Competitive advantages or vulnerabilities
- Barriers to entry in this industry

ASSESSMENT: Rate borrower as Above Average/Average/Below Average relative to industry peers.

TONE: Comparative and benchmarked. Use industry knowledge appropriately.
DO NOT use markdown formatting - plain text only.
Maximum 400 words.`,

        creditAnalysis: `You are the lead credit analyst presenting to the Credit Committee. Provide quantitative credit analysis:

1. DEBT SERVICE CAPACITY:
- Current DSCR: ${numFmt(minDSCR)}x vs covenant ${numFmt(params.minDSCR || 1.2)}x (cushion: ${numFmt(minDSCR - (params.minDSCR || 1.2))}x)
- Trend: improving/stable/deteriorating based on projections
- Stress tolerance: estimate revenue decline before DSCR breaches covenant

2. LEVERAGE PROFILE:
- Net Debt/EBITDA: ${numFmt(maxLeverage)}x vs limit ${numFmt(params.maxNDToEBITDA || 3.5)}x
- Deleveraging trajectory over ${base.rows?.length || 5} year projection
- Assessment of leverage sustainability

3. COLLATERAL ADEQUACY:
- LTV: ${params.collateralValue > 0 ? numFmt((params.requestedLoanAmount / params.collateralValue) * 100) : 'N/A'}%
- Lien position: ${params.lienPosition || 'Not specified'}
- Estimated recovery in default scenario

4. CREDIT RATING ASSESSMENT:
Assign internal rating (Strong / Acceptable / Weak / Poor) with quantitative justification.

TONE: Clinical, quantitative, professional. Lead with numbers. Avoid subjective adjectives without data.
DO NOT use markdown formatting - plain text only.
Maximum 500 words.`,

        collateralAnalysis: `Provide detailed collateral analysis for recovery assessment:

COLLATERAL PACKAGE:
${params.collateralDescription || "No collateral details provided"}

VALUATION ANALYSIS:
- As-Is Market Value: ${currencyFmtMM(params.collateralValue || 0, ccy)}
- Estimated Orderly Liquidation Value: ${currencyFmtMM((params.collateralValue || 0) * 0.70, ccy)} (assume 70% of market)
- Estimated Forced Sale Value: ${currencyFmtMM((params.collateralValue || 0) * 0.50, ccy)} (assume 50% of market)

LOAN-TO-VALUE ANALYSIS:
- LTV on Market Value: ${params.collateralValue > 0 ? numFmt((params.requestedLoanAmount / params.collateralValue) * 100) : 'N/A'}%
- LTV on Orderly Liquidation: ${params.collateralValue > 0 ? numFmt((params.requestedLoanAmount / (params.collateralValue * 0.70)) * 100) : 'N/A'}%
- LTV on Forced Sale: ${params.collateralValue > 0 ? numFmt((params.requestedLoanAmount / (params.collateralValue * 0.50)) * 100) : 'N/A'}%

RECOVERY ANALYSIS:
- Estimated recovery rate in default
- Time to liquidate (estimate in months)
- Liquidation costs (legal, brokerage - typically 10-15%)

COLLATERAL QUALITY:
- Liquidity: High/Medium/Low
- Price volatility assessment
- Marketability and ease of sale

MONITORING REQUIREMENTS:
- Recommended appraisal frequency
- Insurance coverage requirements
- Restrictions on additional liens

CONCLUSION: Rate collateral as Strong/Adequate/Weak with loss-given-default estimate.

TONE: Conservative and recovery-focused.
DO NOT use markdown formatting - plain text only.
Maximum 500 words.`,

        covenantAnalysis: `Analyze covenant structure and headroom for Credit Committee:

FINANCIAL COVENANTS:
1. Minimum DSCR: ${numFmt(params.minDSCR || 1.2)}x
   Current: ${numFmt(minDSCR)}x
   Headroom: ${numFmt(minDSCR - (params.minDSCR || 1.2))}x (${pctFmt((minDSCR - (params.minDSCR || 1.2)) / (params.minDSCR || 1.2))} cushion)
   Breach point: DSCR falls below covenant if EBITDA declines by approximately ${pctFmt((minDSCR - (params.minDSCR || 1.2)) / minDSCR)}

2. Maximum Net Debt/EBITDA: ${numFmt(params.maxNDToEBITDA || 3.5)}x
   Current: ${numFmt(maxLeverage)}x
   Headroom: ${numFmt((params.maxNDToEBITDA || 3.5) - maxLeverage)}x
   
3. Minimum Interest Coverage: ${numFmt(params.targetICR || 2.0)}x
   Current: ${numFmt(minICR)}x
   Headroom: ${numFmt(minICR - (params.targetICR || 2.0))}x

COVENANT TESTING: Quarterly

MOST AT-RISK COVENANT:
Identify which covenant has least headroom and explain why it's most vulnerable.

PROJECTED COMPLIANCE:
Show expected covenant metrics over next 4-8 quarters based on projections.

CURE RIGHTS:
- Equity cure provisions: Yes/No and limitations
- Event of Default triggers

RECOMMENDATION: Rate covenant package as Tight/Adequate/Loose with justification.

TONE: Precise and forward-looking.
DO NOT use markdown formatting - plain text only.
Maximum 400 words.`,

        sensitivityAnalysis: `Provide detailed sensitivity analysis with decision triggers for Credit Committee:

BASE CASE ASSUMPTIONS:
- Revenue Growth: ${pctFmt(params.revenueGrowth || 0)}
- EBITDA Margin: ${pctFmt((base.rows?.[0]?.ebitda || 0) / (base.rows?.[0]?.revenue || 1))}
- Current Min DSCR: ${numFmt(minDSCR)}x

SENSITIVITY TO KEY VARIABLES:

REVENUE SENSITIVITY:
- -10% Revenue Impact: Estimate new DSCR and covenant status
- -20% Revenue Impact: Estimate breach likelihood
- Break-even Revenue: Calculate minimum revenue to maintain ${numFmt(params.minDSCR || 1.2)}x DSCR

MARGIN SENSITIVITY:
- -200bps EBITDA Margin: Impact on coverage ratios
- -500bps EBITDA Margin: Severe stress scenario

INTEREST RATE SENSITIVITY (if applicable):
- +100bps Rate Increase: Impact on debt service and DSCR
- +200bps Rate Increase: Stress scenario impact

DECISION TRIGGERS - Recommend monitoring thresholds:
RED FLAG: DSCR falls below ${numFmt((params.minDSCR || 1.2) + 0.10)}x for two consecutive quarters
ENHANCED MONITORING: Revenue decline exceeds 15% YoY or margin compression exceeds 300bps
STANDARD MONITORING: All metrics within expected ranges

BREAKEVEN ANALYSIS:
Minimum EBITDA required to maintain covenant: Calculate based on debt service.

TONE: Quantitative scenario planning. Help Committee understand vulnerability points.
DO NOT use markdown formatting - plain text only.
Maximum 500 words.`,

        refinancingRisk: `Assess refinancing and exit risk for Credit Committee:

MATURITY PROFILE:
- Facility Maturity Date: ${termSheetFields.maturityDate}
- Projected Debt at Maturity: ${currencyFmtMM(projections.base?.rows?.[projections.base.rows.length - 1]?.endingDebt || 0, ccy)}
- Projected Leverage at Maturity: ${numFmt(projections.base?.rows?.[projections.base.rows.length - 1]?.ndToEbitda || 0)}x

REFINANCING FEASIBILITY:
- Will borrower be "bankable" at maturity? (Compare projected metrics to typical market standards)
- Alternative refinancing sources available (bank market, private credit, capital markets)
- Market access assessment based on projected credit profile

REPAYMENT SOURCES AT MATURITY:
Primary: Refinancing (assess likelihood)
Secondary: Operating cash flow accumulation, asset sales
Tertiary: Sponsor support, collateral liquidation

MATURITY RISK FACTORS:
- Refinancing risk level: Low/Medium/High
- Dependence on market conditions
- Borrower credit profile trajectory

RECOMMENDATION:
Is refinancing risk acceptable given credit profile and structure?

TONE: Forward-looking and market-aware.
DO NOT use markdown formatting - plain text only.
Maximum 300 words.`,

        esgAndRegulatory: `Assess Environmental, Social, Governance, and Regulatory risks for Credit Committee:

ENVIRONMENTAL RISKS:
- Industry environmental profile: High/Medium/Low impact (based on ${params.industry})
- Climate transition risk assessment
- Environmental liabilities or contingencies

SOCIAL RISKS:
- Labor relations and key person dependencies
- Customer/supplier concentration: ${params.keyCustomers || 'Not specified'}
- Product liability or reputational risks

GOVERNANCE ASSESSMENT:
- Management structure and quality
- Related party transactions or conflicts
- Financial reporting quality (audited statements available?)
- Ownership structure

REGULATORY & COMPLIANCE:
- Key licenses and regulatory requirements for ${params.industry}
- Regulatory change risks on horizon
- Historical compliance track record
- Industry-specific regulations

REPUTATIONAL RISK:
- Public perception and brand strength
- Litigation history or ongoing issues
- Customer satisfaction indicators

OVERALL ESG RISK RATING: Low/Medium/High
KEY MITIGANTS: Specific actions to address highest risks

TONE: Comprehensive risk assessment covering non-financial factors.
DO NOT use markdown formatting - plain text only.
Maximum 400 words.`,

        businessAnalysis: `Provide business quality assessment for Credit Committee:

INDUSTRY POSITION:
- Market dynamics and competitive intensity in ${params.industry}
- Industry growth outlook and cyclicality
- Borrower's competitive position and market share

BUSINESS MODEL SUSTAINABILITY:
${params.businessModel || "No business model description provided"}
- Revenue model assessment (recurring vs. transactional)
- Customer acquisition and retention
- Switching costs and competitive moat

MANAGEMENT QUALITY:
- Experience: ${params.managementExperience || 'Not specified'}
- Track record of execution
- Depth of management team
- Succession planning

STRATEGIC RISKS:
- Key person dependencies
- Technology or market disruption risks
- Execution risks in growth strategy

TONE: Objective business fundamentals assessment.
DO NOT use markdown formatting - plain text only.
Maximum 400 words.`,

        recommendation: `Provide final credit recommendation to Credit Committee:

RECOMMENDATION: [State clearly: APPROVE / APPROVE WITH CONDITIONS / DECLINE]

CREDIT DECISION RATIONALE (3-4 supporting factors):
List the key quantitative and qualitative factors driving this recommendation.
Example format:
1. DSCR of ${numFmt(minDSCR)}x provides ${numFmt(minDSCR - (params.minDSCR || 1.2))}x cushion above ${numFmt(params.minDSCR || 1.2)}x covenant
2. [Second factor with specific metrics]
3. [Third factor with specific metrics]

KEY RISKS TO MONITOR (2-3 specific risks):
Identify material risks with measurable indicators.
Example: Customer concentration - Top 3 customers represent X% of revenue

${minDSCR >= (params.minDSCR || 1.2) ? 
  `CONDITIONS OF APPROVAL (if conditional):
- Quarterly compliance certificates within 30 days
- Annual site inspection rights
- Notification requirements for material events
- [Add 2-3 specific conditions based on risk profile]` : ''}

PROPOSED MONITORING FREQUENCY: Quarterly / Semi-Annual / Annual
Justify frequency based on risk profile and covenant cushions.

TONE: Authoritative and decisive. State recommendation with conviction backed by data.
DO NOT use markdown formatting - plain text only.
Maximum 400 words.`,

        riskAssessment: `Identify Top 5 Material Credit Risks in priority order for Credit Committee:

For each risk provide:

RISK 1: [Title]
Description: What could go wrong (2 sentences)
Quantified Impact: Financial impact estimate (e.g., "15% revenue decline breaches DSCR covenant")
Likelihood: High / Medium / Low
Mitigation: Specific covenants or actions that reduce this risk

RISK 2: [Title]
[Same format]

RISK 3: [Title]
[Same format]

RISK 4: [Title]
[Same format]

RISK 5: [Title]
[Same format]

Prioritize by (Likelihood × Impact). Focus on risks that impair debt repayment:
- Covenant breach scenarios
- Revenue/customer concentration
- Margin compression
- Working capital deterioration
- Refinancing risk at maturity
- Operational dependencies
- Market or competitive risks

TONE: Risk-focused but balanced. Committee needs to understand downside scenarios.
DO NOT use markdown formatting - plain text only.
Maximum 600 words.`,

        scenarioAnalysis: `Provide scenario analysis for Credit Committee stress testing:

BASE CASE: IRR ${pctFmt(projections.base?.irr || 0)}, Min DSCR ${numFmt(projections.base?.creditStats?.minDSCR || 0)}, Breaches: ${(projections.base?.breaches?.dscrBreaches || 0) + (projections.base?.breaches?.icrBreaches || 0)}

STRESS SCENARIOS SUMMARY:
${Object.keys(projections).filter(k => k !== 'base').map(scenario => {
  const proj = projections[scenario];
  return `${scenario}: IRR ${pctFmt(proj.irr || 0)}, Min DSCR ${numFmt(proj.creditStats?.minDSCR || 0)}, Breaches: ${(proj.breaches?.dscrBreaches || 0) + (proj.breaches?.icrBreaches || 0)}`;
}).join('\n')}

ANALYSIS REQUIRED:
1. Range of Outcomes: Best case to worst case metrics across all scenarios
2. Breaking Point Analysis: At what point do covenants breach? (e.g., "DSCR breaches under 15% revenue decline")
3. Key Sensitivity Drivers: Revenue vs. margin vs. interest rate - which matters most?
4. Probability Assessment: Assign likelihood to each scenario
5. Recommended Decision Case: State which scenario should drive credit decision (typically base or mild stress)

CONCLUSION: Can structure withstand reasonable stress? Yes/No with supporting rationale.

TONE: Analytical scenario comparison. Focus on downside protection.
DO NOT use markdown formatting - plain text only.
Maximum 500 words.`,

        sponsorAnalysis: `Analyze sponsor/ownership and alignment of interests (if PE/sponsored deal):

SPONSOR PROFILE:
- Name/Firm: [If applicable]
- Track record and reputation
- Financial capacity for support

SPONSOR COMMITMENT:
- Equity invested: ${currencyFmtMM(params.sponsorEquity || 0, ccy)} (${numFmt((params.sponsorEquity || 0) / ((params.sponsorEquity || 0) + params.requestedLoanAmount || 1) * 100)}% of capital structure)
- Meaningful commitment relative to fund size?
- Additional support mechanisms (guarantees, equity commitments)

ALIGNMENT OF INTERESTS:
- Management equity ownership
- Incentive structures
- Exit timeline expectations

SPONSOR TRACK RECORD:
- Past portfolio company performance
- Treatment of lenders in stressed situations
- Industry expertise in ${params.industry}

RISK ASSESSMENT:
- Sponsor stability: Strong/Adequate/Weak
- Likelihood of support if needed: High/Medium/Low

NOTE: If not a sponsored deal, state "Not applicable - direct corporate borrower"

TONE: Assessment of sponsor quality and alignment.
DO NOT use markdown formatting - plain text only.
Maximum 300 words.`
      };

      const systemPrompt = `You are a senior credit analyst at a leading financial institution preparing analysis for a Credit Committee meeting. Your audience consists of C-level executives who will make the final credit decision.

Your analysis must be:
- PROFESSIONAL: Formal tone suitable for executive decision-making
- QUANTITATIVE: Lead with specific numbers and metrics from the data
- DECISIVE: Clear conclusions with supporting evidence
- RISK-FOCUSED: Honest about concerns and weaknesses
- ACTIONABLE: Provide specific recommendations

Remember: Credit committees value precision, honesty, and decisiveness over promotional language.

FINANCIAL MODEL DATA:
${modelSummary}

CRITICAL INSTRUCTION: Do NOT use any markdown formatting in your response. No asterisks for bold (**text**), no hashtags for headers (## Header), no backticks for code (\`code\`). Write in plain text only with proper paragraph breaks and bullet points using dashes or numbers.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompts[section] || prompts.executiveSummary }
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const aiContent = data.choices?.[0]?.message?.content || "No response from AI service.";
      
      // Strip any markdown that may have slipped through
      const cleanedContent = stripMarkdown(aiContent);
      
      setAiGeneratedContent(prev => ({
        ...prev,
        [section]: cleanedContent
      }));
      
      setShowAIPreview(true);
    } catch (error) {
      if (error.name === 'AbortError') {
        setAiError("Request timed out after 30 seconds. Please try again.");
      } else {
        console.error("AI Generation Error:", error);
        setAiError(error.message || "Failed to generate AI analysis. Please try again.");
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Generate all AI sections at once
  const generateAllAIContent = async () => {
    const sections = [
      'executiveSummary', 
      'historicalPerformance',
      'industryBenchmarking',
      'creditAnalysis', 
      'collateralAnalysis',
      'covenantAnalysis',
      'businessAnalysis', 
      'sensitivityAnalysis',
      'refinancingRisk',
      'esgAndRegulatory',
      'recommendation', 
      'riskAssessment', 
      'scenarioAnalysis'
    ];
    
    for (const section of sections) {
      await generateAIAnalysis(section);
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  };


module.exports = { buildPrompt };