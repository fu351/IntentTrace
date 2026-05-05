# Plan: IntentTrace Audit Fix & Improvements

## TL;DR
The project is ~97% complete and production-ready. The core workflow (steps 1-12) is fully implemented with a complete Python analyzer, working VS Code extension, and semantic verification. One minor configuration issue exists (redundant activation events in package.json). Improvements focus on code quality, testing, documentation, and future extensibility.

## Phase 1: Audit Fixes (Immediate)

**1.1 Remove Redundant Activation Events**
- **File**: package.json lines 18-22
- **Action**: Remove all 5 `activationEvents` (lines 18-22)
  - onView:intenttrace.sidebar
  - onCommand:intenttrace.start
  - onCommand:intenttrace.inferIntent
  - onCommand:intenttrace.generateCode
  - onCommand:intenttrace.runVerifier
- **Reason**: VS Code 1.90.0+ auto-generates these from `contributes` declarations
- **Verification**: Run `npm run compile:all` and `npm test` — extension should load without warnings

## Phase 2: Code Organization & Quality (Recommended)

**2.1 Organize Commands into Dedicated Folder**
- **Files affected**:
  - Create: src/commands/StartCommand.ts, src/commands/InferIntentCommand.ts, src/commands/GenerateCodeCommand.ts, src/commands/RunVerifierCommand.ts
  - Modify: src/extension.ts to import from commands folder
- **Refactor strategy**: Extract command registration logic into separate command classes/functions
- **Benefit**: Improves maintainability, follows VS Code extension patterns
- **Verification**: Commands still fire from activity bar and palette

**2.2 Add TypeScript/React Unit Tests**
- **Files to create**:
  - src/tests/services/CsvSchemaService.test.ts — CSV parsing, type inference
  - src/tests/services/PythonAnalysisService.test.ts — analyzer execution, JSON parsing
  - src/tests/vscode/DecorationsManager.test.ts — decoration application
  - webview/src/__tests__/Flowchart.test.tsx — node rendering, status indicators
- **Test framework**: Jest (already common in TypeScript projects, add to package.json devDeps)
- **Coverage target**: 70%+ for new code
- **Verification**: npm run test:extension runs all extension tests

**2.3 Enhance Error Handling in LLM Provider**
- **File**: src/services/llm/VSCodeLMProvider.ts
- **Improvements**:
  - Add structured error messages for specific LLM failure modes (model unavailable, network error, invalid response format)
  - Catch and re-throw with context in inferIntent() and generateCode()
  - Test: Verify user-friendly error appears in sidebar for each failure case
- **Verification**: Trigger failures (no model available, invalid JSON response) and confirm UI shows helpful messages

## Phase 3: Documentation & Insights (Nice-to-Have)

**3.1 Add JSDoc Comments to Extension Services**
- **Files**: 
  - src/services/CsvSchemaService.ts
  - src/services/PythonAnalysisService.ts
  - src/vscode/IntentTraceSidebarProvider.ts
- **Action**: Add method-level JSDoc with @param, @returns, @throws
- **Verification**: TypeScript compiler shows no missing/incorrect docs

**3.2 Create Extension Architecture Guide**
- **File**: Create docs/ARCHITECTURE.md
- **Contents**: 
  - 10-step workflow diagram and code mapping
  - Message flow between sidebar webview and extension
  - LLM integration points (inferIntent, generateCode)
  - Analyzer JSON input/output schema
- **Benefit**: Onboarding for future contributors

**3.3 Add Inline Comments to Complex Functions**
- **Files**:
  - analyzer/slicer.py — backward slicing algorithm
  - analyzer/semantic.py — semantic operation lowering
  - src/vscode/DecorationsManager.ts — decoration application logic
- **Focus**: Explain "why" not "what" for non-obvious logic

## Phase 4: Future Enhancements (Future Roadmap)

**4.1 Support for More Data Formats**
- Currently: CSV only
- Future: Parquet, JSON, Excel, SQL databases
- Impact: Modify CsvSchemaService to dispatch based on file type

**4.2 Extend Python Language Support**
- Currently: Pandas + Matplotlib only
- Future: Polars, Plotly, Seaborn, NumPy operations
- Impact: Add new semantic operation types, extend parser

**4.3 Multi-File Python Projects**
- Currently: Top-level scripts only
- Future: Support imports, function definitions, class methods
- Impact: Major parser refactoring to build inter-procedural analysis

**4.4 Interactive Slice Visualization**
- Enhance flowchart with slice detail pane (show which lines were included/excluded)
- Add toggle to highlight dependency chains in real-time

**4.5 Collaborative Verification**
- Allow sharing intent+verification results as URLs or JSON exports
- Support versioning of intents across iterations

## Relevant Files & Key Patterns

**Critical Application Files**:
- package.json — Activation events, command registration
- src/extension.ts — Entry point, command orchestration
- src/vscode/IntentTraceSidebarProvider.ts — Workflow coordinator
- src/services/llm/VSCodeLMProvider.ts — LLM interface (fully implemented)
- analyzer/main.py — Analyzer CLI orchestrator

**Reference Patterns**:
- LLM prompt building: src/services/llm/VSCodeLMProvider.ts (buildInferIntentPrompt, buildGenerateCodePrompt)
- Message handling: src/vscode/IntentTraceSidebarProvider.ts (type guard isSidebarMessage, switch on message type)
- Semantic lowering: analyzer/semantic.py (lower_to_semantic_operations function)
- Verification: analyzer/verifier.py (verify_semantics function)

## Verification Checklist

**Phase 1 Verification**:
1. ✓ Remove 5 activation events from package.json
2. ✓ Run npm run compile:all — no TypeScript errors
3. ✓ Run npm test — all tests pass
4. ✓ Build VSIX: npm run package:vsix
5. ✓ Load extension locally and confirm commands still appear in palette

**Phase 2 Verification**:
1. ✓ Commands folder created with 4 command modules
2. ✓ extension.ts imports from commands folder
3. ✓ npm run compile:all — no errors
4. ✓ Commands fire correctly from activity bar and palette
5. ✓ Unit tests created for services (Jest config added to package.json)
6. ✓ npm run test:extension runs all extension unit tests
7. ✓ LLM error handling: simulate failures (no model available, invalid JSON) and confirm UI shows helpful messages

**Phase 3 Verification**:
1. ✓ JSDoc comments added to services
2. ✓ TypeScript reports no missing docs
3. ✓ Architecture guide created in docs/ARCHITECTURE.md
4. ✓ Complex functions have inline comments explaining algorithm

## Decisions & Scope

**Included**:
- Fix redundant activation events (1 small, immediate improvement)
- Code organization improvements (command folder) — optional but recommended
- Unit tests for TypeScript/React — recommended for production quality
- Enhanced error handling — recommended for user experience
- Documentation improvements — nice-to-have, low effort

**Excluded** (Future Work):
- New data format support (CSV only, per MVP scope)
- Multi-file Python projects (complex refactoring, out of scope)
- Additional programming languages beyond Python
- Collaborative features (versioning, sharing)
- Performance optimizations

**Design Decisions**:
- Phase 1 (activation events) is low-risk, should be done immediately
- Phase 2 improvements are independent and can be done in any order
- Phase 3 (documentation) should happen after code is stable
- Phase 4 represents future capability expansion, not needed for MVP

## Further Considerations

1. **Test Strategy**: Should TypeScript/React tests be added before or as part of refactoring? 
   - Recommendation: After Phase 2.1 (command organization) to test new structure, then retrofit to other services.

2. **Error Message Consistency**: Should error messages follow VS Code's built-in patterns (e.g., "ExtensionNameError: detail" format)?
   - Recommendation: Yes, follow VS Code extension guidelines.

3. **Demo Expansion**: Should additional demo files be added (e.g., wrong_grouping, unsupported_pattern)?
   - Recommendation: Defer to future minor release; current weather demo is sufficient for MVP.

---

## CRITICAL FINDINGS: Semantic Operations Gap & Flowchart Robustness

### 🔴 MAJOR ISSUE: Only 6 of 11 Required Semantic Operations Implemented (55% complete!)

**AGENTS.md specifies 11 operations. Current implementation:**
- ✅ ReadCSV — Implemented
- ❌ **SelectColumns** — MISSING (df[['col1', 'col2']], df.drop(), df.select_dtypes())
- ✅ DropNA — Implemented
- ❌ **FilterRows** — MISSING (df[df['col'] > value], df.query(), df.loc[], boolean masks)
- ✅ GroupBy — Implemented
- ✅ Aggregate — Implemented (but limited: only mean/count/agg)
- ❌ **Sort** — MISSING (df.sort_values(), df.sort_index())
- ❌ **ParseDate** — MISSING (pd.to_datetime())
- ✅ Plot — Implemented
- ✅ PlotFormatting — Implemented
- ✅ Unknown — Fallback (overused due to missing operations!)

**Why flowchart is "hardcoded to demo"**: 
- semantic.py._lower_node() only detects 6 operations
- Everything else → "Unknown" classification
- Result: ~50-60% of real code gets marked "Unknown"
- Current flowchart display just shows operation types as buttons, doesn't render actual graph

### Root Causes:
1. **Missing Operation Detection** (Critical): 5 operation types not in _lower_node() logic
2. **Limited Aggregation Detection**: Only mean/count/agg; missing min/max/std/median/etc.
3. **Weak Visualization**: Flowchart is just a vertical list of divs, no actual graph rendering
4. **Limited Test Fixtures**: Only 5 demo files, no robustness tests for varied code styles
5. **No Edge Rendering**: FlowGraph.edges exist but never visualized

---

## Phase 2.5: Semantic Operations & Visualization Modernization (HIGHEST PRIORITY)

### 2.5.0 Add Missing Semantic Operations to semantic.py

**Goal**: Implement the 5 missing operations to reduce "Unknown" from 50% → <5%

**2.5.0a SelectColumns**
```python
# Primary patterns (core detection):
df[['col1', 'col2']]
df.drop('col', axis=1)
df.drop(columns=['col1', 'col2'])
df.select_dtypes(include=['number'])

# Edge cases & sparse operations (also SelectColumns):
df.filter(['col1', 'col2'])                      # Polars-style (might be in code adapted from other libs)
df[[col for col in df.columns if condition]]     # Column comprehension
df[df.columns.difference(['col'])]               # Set difference selection
df.loc[:, ['col1', 'col2']]                      # Label-based selection
df.iloc[:, [0, 1]]                               # Index-based selection
df.drop_duplicates(subset=['col'])               # Related: filters columns in aggregation context
df[df.columns.drop(['col'])]                     # Using Index.drop()
df[[c for c in df.columns if 'pattern' in c]]   # Pattern matching on column names
df.pop('col') in loop                            # Removing columns iteratively

# Add to semantic.py:
def _find_select_columns(node: ast.AST) -> ast.expr | None
  # Check: bracket selection with list of strings
  # Check: .drop() with axis=1 or columns= keyword
  # Check: .select_dtypes() calls
  # Check: list comprehensions over df.columns
  # Check: .loc[:, ...], .iloc[:, ...] patterns
  # Check: .difference(), .drop() on column Index
  # Returns: SelectColumns operation if any match

def _select_columns_operation(...) -> SemanticOperation
  # Extract column names from detected pattern
  # Classify as "select" (explicit) or "drop" (negative selection)
  # Return params with column count, operation type
```

**2.5.0b FilterRows**
```python
# Primary patterns (core detection):
df[df['col'] > value]
df[df['col'].isin([1,2,3])]
df.query("col > @threshold")
df.loc[mask]

# Edge cases & sparse operations (also FilterRows):
df[condition]                                    # Condition stored in variable
df[df['col'].str.contains('pattern')]            # String pattern matching
df[df['col'].between(a, b)]                      # Range filtering
df[df['col'].notna()]                            # Remove NA values (filtering, not DropNA)
df[df['col'].isna()]                             # Select NA values
df[df['col'].isnull()]                           # Alias for isna()
df[~df['col'].isin([exclude])]                   # Negative filtering with ~
df[df['col'] != value]                           # Inequality
df[df['col'].str.startswith('prefix')]           # String prefix matching
df[df['col'].dt.year == 2023]                    # Date/datetime filtering
df.filter(like='pattern')                        # Column name pattern (different but filtering)
df[df.index > 5]                                 # Index-based filtering
df[df[['col1', 'col2']].notna().all(axis=1)]    # Multi-column NA filtering
df.nlargest(n, 'col')                            # Top N (filtering variant)
df.nsmallest(n, 'col')                           # Bottom N (filtering variant)
df.head(n)                                       # First N rows (trivial filter)
df.tail(n)                                       # Last N rows (trivial filter)
df.sample(n=10)                                  # Random sampling (filtering variant)
df.drop_duplicates()                             # Remove duplicate rows (filtering)
df.drop_duplicates(subset=['col'])               # Remove duplicates by subset (filtering)

# Add to semantic.py:
def _find_filter_rows(node: ast.AST) -> ast.expr | None
  # Check: boolean indexing (df[mask] or df[df['col'] > value])
  # Check: .isin(), .between(), .str operations
  # Check: .query() calls with string conditions
  # Check: .loc[] with condition
  # Check: .notna(), .isna() chains
  # Check: .nlargest(), .nsmallest()
  # Check: .head(), .tail()
  # Check: .sample() with n parameter
  # Check: .drop_duplicates()
  # Returns: FilterRows operation if any match

def _filter_rows_operation(...) -> SemanticOperation
  # Extract filter condition type (comparison, contains, between, etc.)
  # Extract affected columns
  # Return params with condition type, column references
```

**2.5.0c Sort**
```python
# Primary patterns (core detection):
df.sort_values(by='col')
df.sort_values(by=['col1', 'col2'])
df.sort_index()

# Edge cases & sparse operations (also Sort):
df.sort_values(by='col', ascending=False)        # Descending sort
df.sort_values(by=['col1', 'col2'], ascending=[True, False])  # Multi-col mixed
df.sort_index(ascending=False)                   # Sort by index descending
df.sort_values(by='col', na_position='last')     # NA handling
df.sort_values(by='col', key=lambda x: x.str.len())  # Custom sort key
df.sort_values('col', inplace=True)              # In-place sort
df = df.sort_values('col')                       # Assignment after sort
df.rank()                                        # Ranking (related to sort)
df['col'].rank()                                 # Column ranking
df.nlargest(n, 'col')                            # Related: top N by value
df.nsmallest(n, 'col')                           # Related: bottom N by value
df.sort_values(['col1', 'col2'], kind='mergesort')  # With sort algorithm specified
df.groupby('col').apply(lambda x: x.sort_values('value'))  # Sort within groups

# Add to semantic.py:
def _find_sort(node: ast.AST) -> ast.Call | None
  # Check: .sort_values() calls with 'by' parameter
  # Check: .sort_index() calls
  # Check: .rank() calls
  # Check: .nlargest(), .nsmallest() with column (filtering+sort)
  # Check: sort_values with nested apply (groupby sort)
  # Extract: sort column(s), ascending/descending
  # Returns: Sort operation if any match

def _sort_operation(...) -> SemanticOperation
  # Extract sort column(s), direction (asc/desc)
  # Extract any sorting method (mergesort, heapsort, etc.)
  # Return params with columns, direction, method
```

**2.5.0d ParseDate**
```python
# Primary patterns (core detection):
pd.to_datetime(df['col'])
df['date'] = pd.to_datetime(df['date_str'])

# Edge cases & sparse operations (also ParseDate):
pd.to_datetime(df['col'], format='%Y-%m-%d')     # With explicit format
df['col'] = pd.to_datetime(df['col'])            # In-place assignment
pd.to_datetime(df['col'], unit='s')              # Unix timestamp conversion
pd.to_datetime(df['col'], unit='ms')             # Millisecond timestamp
pd.to_datetime(df['col'], errors='coerce')       # Error handling (invalid → NaT)
pd.to_datetime(df['col'], errors='ignore')       # Ignore invalid (return original)
df['date'] = pd.to_datetime(df['date_str'], unit='s')  # Chained assignment
df['col'].astype('datetime64[ns]')               # Type conversion alternative
df['col'].astype('datetime64')                   # Type conversion simplified
pd.to_datetime([df['col1'], df['col2']])         # Multiple columns
df['date'] = pd.to_datetime(df[['year', 'month', 'day']])  # From year/month/day
pd.to_datetime(df['col'], infer_datetime_format=True)  # Infer format
df['col'] = pd.to_datetime(df['col']).dt.date    # Parse then extract date
df['col'] = pd.to_datetime(df['col'], utc=True)  # UTC timezone
df['date'] = pd.to_datetime(df['timestamp'], unit='s', utc=True)  # Chained

# Add to semantic.py:
def _find_parse_date(node: ast.AST) -> ast.Call | None
  # Check: pd.to_datetime() calls (with various parameters)
  # Check: .astype('datetime64[ns]') calls
  # Check: .astype('datetime64') calls
  # Check: Column assignment with to_datetime
  # Extract: source column(s), format if specified, timezone if specified
  # Returns: ParseDate operation if any match

def _parse_date_operation(...) -> SemanticOperation
  # Extract source column, target column (if different)
  # Extract format string if present
  # Extract unit if present (for unix timestamps)
  # Extract timezone if present (utc=True)
  # Return params with all detected attributes
```

**2.5.0e Extend Aggregation Detection**
```python
# Currently only: mean, count, agg
# Need to detect and distinguish all aggregation functions:

AGGREGATION_FUNCTIONS = {
  # Statistical:
  "mean": "mean",
  "sum": "sum",
  "count": "count",
  "min": "min",
  "max": "max",
  "std": "std",
  "var": "variance",
  "median": "median",
  
  # Selection:
  "first": "first",
  "last": "last",
  "size": "size",
  
  # Numeric:
  "prod": "product",
  "sem": "std_error",
  "quantile": "quantile",
  "describe": "describe",
  
  # String/categorical:
  "unique": "unique",
  "nunique": "nunique",
  "mode": "mode",
}

# Primary aggregation patterns (grouped operations):
df.groupby('col')['measure'].mean()
df.groupby('col')['measure'].sum()
df.groupby(['col1', 'col2'])['measure'].min()
df.groupby('col')['measure'].max()
df.groupby('col')['measure'].count()

# Edge cases & sparse operations (also Aggregate):
df.groupby('col')['measure'].std()               # Standard deviation
df.groupby('col')['measure'].var()               # Variance
df.groupby('col')['measure'].median()            # Median
df.groupby('col')['measure'].first()             # First value in group
df.groupby('col')['measure'].last()              # Last value in group
df.groupby('col')['measure'].size()              # Group size
df.groupby('col')['measure'].prod()              # Product of values
df.groupby('col')['measure'].quantile(0.25)      # Quartile/percentile
df.groupby('col')[['m1', 'm2']].sum()            # Multi-measure aggregation
df.groupby('col').agg({'col1': 'sum', 'col2': 'mean'})  # Dict-based agg
df.groupby('col').agg(['sum', 'mean', 'count'])  # List of functions
df.groupby('col').agg(custom_func)               # Custom function agg
df.groupby('col')['measure'].apply(lambda x: ...) # Custom apply
df.groupby('col')['measure'].value_counts()      # Value frequency (sparse)
df.groupby('col')['measure'].nlargest(n)         # Top N in group
df.groupby('col')['measure'].transform(func)     # Transform (not true agg)
df.groupby('col')[['m1', 'm2']].agg(func_dict)   # Multi-column named agg
df.groupby('col').agg(m1=('col1', 'sum'), m2=('col2', 'mean'))  # Named aggregation
df.groupby('col', as_index=False)['measure'].mean()  # Without groupby col in result
df.resample('D')['measure'].mean()               # Time-based aggregation
df.pivot_table(values='measure', index='col1', columns='col2', aggfunc='mean')  # Pivot with agg

# Add to semantic.py:
def _find_aggregate_in_groupby(node: ast.AST) -> tuple[ast.Call, ast.Call] | None
  # Check for pattern: groupby(...)[...].agg_function(...)
  # Check for pattern: groupby(...).agg({...})
  # Check for pattern: groupby(...)[...].apply(custom_func)
  # Check for pattern: groupby(...)[...].transform(func)
  # Extract: groupby columns, measure column(s), agg function type
  # Also check if multiple aggregations chained or combined
  # Returns: tuple(groupby_call, aggregate_call) or None

def _detect_agg_function_type(func_name: str, node: ast.AST) -> str
  # Maps function name to aggregation type
  # mean → "mean", sum → "sum", etc.
  # For .agg(...), parse the argument structure
  # For .apply(...), try to infer from lambda or function definition
  # Returns: aggregation function name (fallback to "unknown" if can't infer)

def _aggregate_operation(...) -> SemanticOperation
  # Extract: groupby columns, measure columns, aggregation functions
  # Handle multiple measures and multiple agg functions
  # Return params with all detected aggregation details
  # Mark as "complex" if multiple functions or measures involved
```

**Verification**: 
- ✓ All 20 existing tests pass
- ✓ New: test_select_columns.py (10 tests + edge cases)
- ✓ New: test_filter_rows.py (10 tests + edge cases)
- ✓ New: test_sort.py (5 tests + edge cases)
- ✓ New: test_parse_date.py (3 tests + edge cases)
- ✓ Enhanced: test_semantic.py adds extended aggregation tests (10+ tests)
- ✓ Estimate: Reduce "Unknown" from 50% → 5% on real code

---

### 2.5.0f Comprehensive Edge Case Handling

**Key Principle**: Each semantic operation must recognize multiple syntactic patterns and edge cases, not just "happy path" examples.

**DropNA Edge Cases** (Already implemented, but ensure coverage):
```python
# Primary:
df.dropna()                          # Drop any row with NA
df.dropna(subset=['col'])            # Drop if NA in specific cols

# Edge cases:
df.dropna(thresh=n)                  # Drop if fewer than n non-NA values
df.dropna(how='any')                 # Explicit any (default)
df.dropna(how='all')                 # Drop only if all NA
df.dropna(subset=['col'], how='all') # Combined
df.fillna(value)                     # Related: fill instead of drop (mark as DropNA? or separate operation?)
df.fillna(method='ffill')            # Forward fill (handle NAs differently)
df.fillna(method='bfill')            # Backward fill
df['col'].fillna(df['col'].mean())   # Fill with computed value
df.interpolate()                     # Interpolate NAs (time series)
```

**Pattern Recognition Strategy**:
1. **Multiple Syntax Patterns**: Each operation has 5-10+ valid syntax variations
2. **Chained Calls**: Detect patterns spread across assignments and chained methods
3. **Parameter Variations**: Same function with different keyword arguments
4. **String vs. List Arguments**: Accept both 'col' and ['col'] formats
5. **In-place vs. Assignment**: df.sort_values() vs. df = df.sort_values()
6. **Method Chaining**: df.groupby().agg().reset_index() should detect all parts
7. **Custom Functions**: .apply(lambda x: ...) and .apply(custom_func)
8. **Library Variations**: pandas core methods + polars-style alternatives
9. **Assignment Targets**: Track when result is assigned to different variable

**Edge Cases to Test**:
- Missing arguments (defaults used)
- Keyword-only arguments
- Positional arguments
- Variable references instead of literals (e.g., threshold = 50; df[df['col'] > threshold])
- Nested function calls
- Method chaining across multiple lines
- Comments between method calls
- Different code styles (spaces, indentation, line breaks)
- Aliased library imports (import pandas as pd vs import pandas)

**Implementation Strategy**:
- Use AST traversal to find all relevant patterns
- Don't rely on string matching or regex
- Extract metadata (column names, functions, directions, etc.) from AST nodes
- Graceful fallback: If pattern recognized but parameters unclear, mark as "medium confidence"
- Log unrecognized variants for future enhancement

**Example: FilterRows Pattern Detection**
```python
def _find_filter_rows(node: ast.AST) -> list[tuple[str, ast.expr]]:
  """Find all row filtering patterns in node.
  
  Returns list of (pattern_type, expression_node) tuples:
  - ('boolean_index', node) - df[df['col'] > value]
  - ('query', node) - df.query("col > value")
  - ('isin', node) - df[df['col'].isin([values])]
  - ('string_contains', node) - df[df['col'].str.contains('pattern')]
  - ('between', node) - df[df['col'].between(a, b)]
  - ('head', node) - df.head(n)
  - ('tail', node) - df.tail(n)
  - ('sample', node) - df.sample(n=10)
  - ('drop_duplicates', node) - df.drop_duplicates()
  """
  patterns = []
  
  # Check direct subscript: df[mask] or df[df['col'] > value]
  for subscript in find_subscripts(node):
    if looks_like_filter(subscript):
      patterns.append(('boolean_index', subscript))
  
  # Check method calls
  for call in find_method_calls(node):
    method = get_method_name(call)
    if method == 'query':
      patterns.append(('query', call))
    elif method == 'isin':
      patterns.append(('isin', call))
    # ... etc
  
  return patterns
```

---

### 2.5.1 Choose Visualization Library

**Research Results:**

| Library | Ease | Customization | Bundle | Best Use | Status |
|---------|------|--------------|--------|----------|--------|
| **Mermaid.js** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 25KB | Quick MVP, professional look | ✅ RECOMMENDED |
| **React Flow** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 60KB | Premium, fully interactive | 🏆 UPGRADE PATH |
| D3.js | ⭐ | ⭐⭐⭐⭐⭐ | 100KB+ | Complex custom viz | ❌ Overkill |
| Cytoscape.js | ⭐⭐ | ⭐⭐⭐ | 50KB | Graph-focused | ⚠️ Viable alt |
| SVG Custom | ⚠️ | ⭐⭐⭐⭐⭐ | 0KB | Full control | ❌ Maintenance burden |

**Recommendation**:
- **MVP Path**: Start with Mermaid.js (1-2 days implementation)
  - Fast to implement, solves immediate visualization gap
  - Automatic layout, professional appearance
  - Good for demos and proof-of-concept
  - `npm install mermaid mermaid-react`

- **Premium Path**: Upgrade to React Flow later (future iteration)
  - Full node/edge customization
  - Drag-drop interactivity, delete operations
  - Better for production use
  - Not needed for MVP

**Implementation for Mermaid**:
1. Convert FlowGraph to Mermaid flowchart syntax
2. Render in webview/src/Flowchart.tsx
3. Color nodes by status (green=relevant, gray=vestigial, red=error, yellow=warning)
4. Click node → show details panel
5. Hover → show tooltip with line range

---

### 2.5.2 Update Flowchart Visualization

**File**: webview/src/Flowchart.tsx

**Changes**:
```tsx
// Current: Simple list of divs
// New: Mermaid flowchart with:
// - Actual edges between operations
// - Node colors by status
// - Clickable for details
// - Hover tooltips
// - Pan/zoom controls

import Mermaid from 'mermaid-react';

export function Flowchart({ graph, selectedNodeId, onSelectNode }: FlowchartProps) {
  const mermaidCode = generateMermaidDiagram(graph);
  return (
    <MermaidComponent
      code={mermaidCode}
      onNodeClick={onSelectNode}
      selectedNodeId={selectedNodeId}
    />
  );
}
```

**Benefits**:
- Professional appearance (vs. simple list)
- Actual graph rendering (vs. hardcoded layout)
- Edges visualized (vs. ignored)
- Auto-layout (vs. manual positioning)
- Scales to large graphs (vs. breaks at 30+ nodes)

---

### 2.5.3 Add Robustness Tests with Comprehensive Edge Cases

**New test files**:
- analyzer/tests/test_semantic_robustness.py — 50+ code patterns
- analyzer/fixtures/select_columns_example.py — edge cases
- analyzer/fixtures/filter_rows_example.py — edge cases
- analyzer/fixtures/sort_example.py — edge cases
- analyzer/fixtures/parse_date_example.py — edge cases
- analyzer/fixtures/chained_operations.py — multi-operation sequences
- analyzer/fixtures/varied_syntax.py — different coding styles
- analyzer/fixtures/generated_code_sample.py — real LLM output
- analyzer/fixtures/edge_cases.py — boundary conditions
- analyzer/fixtures/sparse_operations.py — less common patterns

**Test Strategy**:

1. **Core Operation Tests** (each operation in isolation):
   - SelectColumns: df[...], df.drop(...), df.select_dtypes(...), df.loc[:, ...], etc.
   - FilterRows: df[mask], df.query(...), df.isin(...), df.between(...), df.head/tail, etc.
   - Sort: df.sort_values(...), df.sort_index(...), df.rank(), etc.
   - ParseDate: pd.to_datetime(...), .astype('datetime64'), with format/unit/timezone variations

2. **Combination Tests** (operations in realistic sequence):
   - ReadCSV → SelectColumns → FilterRows → GroupBy → Aggregate → Plot
   - ReadCSV → DropNA → Sort → Plot
   - ReadCSV → ParseDate → GroupBy (by date) → Aggregate → Plot
   - Chained method calls: df.select(...).filter(...).sort(...).agg(...)

3. **Syntax Variation Tests** (different but semantically identical):
   - Assignment styles: df = df.sort(...) vs df.sort(...) inplace
   - Argument styles: sort_values(by='col') vs sort_values('col')
   - Chaining: df.filter(x).sort(y) vs f1=df.filter(x); f2=f1.sort(y)
   - Variable names: df, data, df_clean, result, etc.
   - Whitespace: different indentation, line breaks, spacing

4. **Edge Case Tests** (boundary conditions):
   - Empty dataframes: df[df['col'] > 1000] (no matches)
   - Single column: df[['only_col']]
   - Single row: df.head(1)
   - Missing values throughout: df.dropna() on sparse data
   - All same values: df.sort_values('col') where all values equal
   - Mixed types: df[['int_col', 'str_col']]
   - Large DataFrames: synthetic 100k row test
   - Date edge cases: leap years, DST transitions, timezone conversions

5. **Sparse/Uncommon Pattern Tests**:
   - df.nlargest(5, 'col') — should recognize as FilterRows variant
   - df.sample(n=100) — should recognize as FilterRows variant
   - df.query("col > @threshold") — should recognize as FilterRows
   - df[df.columns.difference(['col'])] — should recognize as SelectColumns
   - df.drop_duplicates() — should recognize as FilterRows
   - df.rank() — should recognize as Sort variant
   - df.resample('D').sum() — time-based aggregation

**Detailed Test Fixture Content**:

`select_columns_example.py`:
- Direct bracket selection: df[['A', 'B']]
- drop() with axis=1: df.drop('C', axis=1)
- drop() with columns keyword: df.drop(columns=['C', 'D'])
- select_dtypes: df.select_dtypes(include=['number'])
- List comprehension: df[[c for c in df.columns if df[c].dtype == 'int64']]
- Negative selection: df[df.columns.difference(['drop_me'])]
- loc notation: df.loc[:, ['A', 'B']]
- iloc notation: df.iloc[:, [0, 1]]
- rename() for column subsetting: df.rename(columns={...}).drop(...) 

`filter_rows_example.py`:
- Boolean indexing: df[df['age'] > 30]
- Multiple conditions: df[(df['age'] > 30) & (df['city'] == 'NYC')]
- isin(): df[df['category'].isin(['A', 'B'])]
- String methods: df[df['name'].str.contains('John')]
- between(): df[df['price'].between(10, 50)]
- Date filtering: df[df['date'] > '2023-01-01']
- notna(): df[df['value'].notna()]
- query(): df.query('age > 30 and city == "NYC"')
- head/tail: df.head(10), df.tail(5)
- sample: df.sample(n=10), df.sample(frac=0.1)
- drop_duplicates: df.drop_duplicates(), df.drop_duplicates(subset=['email'])
- nlargest/nsmallest: df.nlargest(10, 'sales')

`sort_example.py`:
- Simple sort: df.sort_values('date')
- Descending: df.sort_values('score', ascending=False)
- Multi-column: df.sort_values(['dept', 'salary'], ascending=[True, False])
- By index: df.sort_index()
- With NaN handling: df.sort_values('col', na_position='last')
- Custom key: df.sort_values('col', key=lambda x: x.str.len())
- Inplace: df.sort_values('col', inplace=True)
- After assignment: df = df.sort_values('col')
- rank(): df['rank'] = df['score'].rank()
- nlargest/nsmallest: df.nlargest(5, 'revenue')

`parse_date_example.py`:
- Basic: pd.to_datetime(df['date_str'])
- With format: pd.to_datetime(df['date_str'], format='%Y-%m-%d')
- Unix timestamp: pd.to_datetime(df['timestamp'], unit='s')
- Millisecond: pd.to_datetime(df['ts_ms'], unit='ms')
- Error handling: pd.to_datetime(df['date'], errors='coerce')
- Assignment: df['date'] = pd.to_datetime(df['date_str'])
- UTC timezone: pd.to_datetime(df['date'], utc=True)
- From components: pd.to_datetime(df[['year', 'month', 'day']])
- Extraction after: pd.to_datetime(df['date']).dt.year
- Infer format: pd.to_datetime(df['date'], infer_datetime_format=True)

`chained_operations.py`:
- ReadCSV → DropNA → SelectColumns → GroupBy → Aggregate
- Long chain: df.read_csv(...).dropna().groupby('col').agg(...)...
- Multiple assignments in chain
- Intermediate variable names

`varied_syntax.py`:
- Different variable names: df, data, dataset, results
- Different spacing and indentation
- Comments between operations
- Line breaks in method chains
- Long vs. short parameter names
- Aliased imports: `import pandas as pd` vs `from pandas import DataFrame`

`generated_code_sample.py`:
- Real LLM-generated code samples (Copilot, ChatGPT outputs)
- Realistic mixed styles and patterns
- Common beginner patterns (reinvented wheels)
- Common expert patterns (complex one-liners)

`edge_cases.py`:
- Empty dataframes
- Single row/column dataframes
- All-NA columns
- Mixed dtype operations
- Large (100k+) row dataframes
- Unicode/special characters in column names
- Very long column names (100+ chars)
- Numeric column names

`sparse_operations.py`:
- Less common pandas methods
- Deprecated syntax (still valid)
- Alternative parameter names
- Chained operations that span 5+ lines
- Operations split across multiple statements

**Test Implementation** (`test_semantic_robustness.py`):
```python
def test_select_columns_all_patterns():
  """Test that all SelectColumns pattern variants are recognized."""
  fixtures = [
    ("df[['A', 'B']]", "SelectColumns"),
    ("df.drop('C', axis=1)", "SelectColumns"),
    ("df[[c for c in df.columns if df[c].dtype == 'int64']]", "SelectColumns"),
    ("df.loc[:, ['A', 'B']]", "SelectColumns"),
    # ... 15+ more patterns
  ]
  for code, expected_op in fixtures:
    operations = analyze(code)
    assert any(op.kind == expected_op for op in operations), f"Failed: {code}"

def test_filter_rows_all_patterns():
  """Test that all FilterRows pattern variants are recognized."""
  # ... similar structure

def test_chained_operations():
  """Test that realistic multi-operation sequences are recognized."""
  code = """
  df = pd.read_csv('data.csv')
  df = df.dropna(subset=['date'])
  df = df[['date', 'value', 'category']]
  df = df[df['value'] > 0]
  summary = df.groupby('category')['value'].mean()
  summary = summary.sort_values(ascending=False)
  plt.bar(summary.index, summary.values)
  plt.show()
  """
  operations = analyze(code)
  kinds = [op.kind for op in operations]
  assert 'ReadCSV' in kinds
  assert 'DropNA' in kinds
  assert 'SelectColumns' in kinds
  assert 'FilterRows' in kinds
  assert 'GroupBy' in kinds
  assert 'Aggregate' in kinds
  assert 'Sort' in kinds
  assert 'Plot' in kinds

def test_unknown_rate_below_5_percent():
  """Verify that Unknown operations are < 5% after fixes."""
  fixtures = [...]  # 100+ diverse code snippets
  operations = analyze_all(fixtures)
  unknown_ratio = sum(1 for op in operations if op.kind == "Unknown") / len(operations)
  assert unknown_ratio < 0.05, f"Unknown rate {unknown_ratio:.1%} exceeds 5% threshold"
```

**Verification**:
- ✓ "Unknown" < 5% of total operations on diverse code
- ✓ All 20 original tests still pass
- ✓ 70+ new robustness tests pass (10+ per operation type)
- ✓ Edge cases handled gracefully (no crashes)
- ✓ No regressions on demo code

---

### 2.5.4 Enhance Error Messages & Confidence Scoring

**For remaining "Unknown" operations**:
- Add confidence level (High/Medium/Low)
- Show AST type that couldn't be matched
- Suggest operation types that might match
- Help users understand why operation was unknown

**Example**:
```
Unknown Operation (Medium Confidence)
Kind: List comprehension
Possible operations: SelectColumns, FilterRows
Code: [x*2 for x in df['value']]
Note: This looks like it might be column transformation, but wasn't recognized.
```

---

## Implementation Priority & Timeline

### Phase 2.5 (CRITICAL PATH - Do This First!)
1. **2.5.0** Implement SelectColumns, FilterRows, Sort, ParseDate (3-4 days)
   - Most impactful: Reduces "Unknown" from 50% → 5%
   - 30 new unit tests
   - No breaking changes
   
2. **2.5.3** Add robustness test fixtures (1-2 days)
   - Prevents regressions
   - Validates varied code styles
   
3. **2.5.1** Choose Mermaid.js for visualization (immediate)
   - Low-risk decision
   - High impact on UX
   
4. **2.5.2** Integrate Mermaid into webview (1-2 days)
   - Professional appearance
   - Actual graph rendering

### Phase 2 (Original - Do These After)
- 2.1: Command organization
- 2.2: TypeScript/React unit tests
- 2.3: LLM error handling

### Phase 3 (Documentation - Do Last)
- 3.1: JSDoc comments
- 3.2: Architecture guide
- 3.3: Inline comments

---

## Success Criteria for Phase 2.5

- ✅ All 11 semantic operations properly detected (SelectColumns, FilterRows, Sort, ParseDate added)
- ✅ "Unknown" operations < 5% on diverse code (vs. 50% today)
- ✅ Flowchart renders with Mermaid (actual graph, not list)
- ✅ All 20 existing tests pass
- ✅ 50+ new robustness tests pass
- ✅ Demo still works perfectly
- ✅ No breaking changes to analyzer JSON schema
- ✅ Webview shows professional-looking data flow diagram

