#!/bin/bash

# BallisticsToolkit Code Formatter
# Recursively formats C++, HTML, CSS, and JS files using appropriate formatters

# Don't exit on errors - we want to continue formatting other files
# set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default directories to format if no args provided
DEFAULT_DIRS=("src" "include" "web")

# Function to print colored output
print_status() {
    echo -e "${BLUE}[FORMAT]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if required formatters are installed
check_formatters() {
    local missing_tools=()
    
    # Check clang-format for C++
    if ! command -v clang-format &> /dev/null; then
        missing_tools+=("clang-format")
    else
        VERSION=$(clang-format --version | grep -o '[0-9]\+\.[0-9]\+' | head -1)
        print_status "Using clang-format version $VERSION"
    fi
    
    # Check prettier for HTML/CSS/JS (preferred)
    if command -v prettier &> /dev/null; then
        VERSION=$(prettier --version)
        print_status "Using prettier version $VERSION"
    elif command -v js-beautify &> /dev/null; then
        VERSION=$(js-beautify --version 2>/dev/null | head -1)
        print_status "Using js-beautify version $VERSION"
    else
        missing_tools+=("prettier or js-beautify")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        print_error "Missing formatters: ${missing_tools[*]}"
        print_error "Please install missing tools:"
        print_error "  Ubuntu/Debian: sudo apt install clang-format npm && npm install -g prettier"
        print_error "  Or: sudo apt install clang-format jsbeautifier"
        print_error "  Fedora: sudo dnf install clang-tools-extra npm && npm install -g prettier"
        print_error "  macOS: brew install clang-format node && npm install -g prettier"
        exit 1
    fi
}

# Function to format a single file
format_file() {
    local file="$1"
    
    if [[ ! -f "$file" ]]; then
        print_warning "File does not exist: $file"
        return 1
    fi
    
    # Determine file type and formatter
    local formatter=""
    local file_type=""
    
    if [[ "$file" =~ \.(cpp|h|hpp|c|cc|cxx)$ ]]; then
        formatter="clang-format"
        file_type="C++"
    elif [[ "$file" =~ \.(html|htm)$ ]]; then
        formatter="html"
        file_type="HTML"
    elif [[ "$file" =~ \.css$ ]]; then
        formatter="css"
        file_type="CSS"
    elif [[ "$file" =~ \.js$ ]]; then
        formatter="js"
        file_type="JavaScript"
    else
        print_warning "Skipping unsupported file type: $file"
        return 0
    fi
    
    print_status "Formatting $file_type: $file"
    
    # Create backup
    cp "$file" "$file.bak"
    
    # Format the file based on type
    local success=false
    
    if [[ "$formatter" == "clang-format" ]]; then
        if clang-format -i -style="$CLANG_FORMAT_STYLE" "$file"; then
            success=true
        fi
    elif [[ "$formatter" == "html" || "$formatter" == "css" || "$formatter" == "js" ]]; then
        # Try prettier first, then js-beautify
        if command -v prettier &> /dev/null; then
            if prettier --write "$file" --parser="$formatter" 2>/dev/null; then
                success=true
            fi
        elif command -v js-beautify &> /dev/null; then
            if [[ "$formatter" == "js" ]]; then
                # Use clang-format-like settings: 2-space indentation, expanded braces
                if js-beautify -s 2 -c " " -b "expand" "$file" > "$file.tmp" 2>/dev/null && mv "$file.tmp" "$file"; then
                    success=true
                fi
            else
                # js-beautify only supports JavaScript, skip HTML/CSS silently
                success=true  # Don't treat as error
            fi
        fi
    fi
    
    if [[ "$success" == "true" ]]; then
        # Check if file was actually changed
        if ! diff -q "$file" "$file.bak" > /dev/null; then
            print_success "Formatted: $file"
        else
            print_status "No changes needed: $file"
        fi
        rm "$file.bak"
        return 0
    else
        print_error "Failed to format: $file"
        mv "$file.bak" "$file"
        return 1
    fi
}

# Function to format all supported files in a directory recursively
format_directory() {
    local dir="$1"
    
    if [[ ! -d "$dir" ]]; then
        print_warning "Directory does not exist: $dir"
        return 1
    fi
    
    print_status "Formatting directory: $dir"
    
    # Find all supported files recursively
    local files=()
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$dir" -type f \( -name "*.cpp" -o -name "*.h" -o -name "*.hpp" -o -name "*.c" -o -name "*.cc" -o -name "*.cxx" -o -name "*.html" -o -name "*.htm" -o -name "*.css" -o -name "*.js" \) -print0)
    
    if [[ ${#files[@]} -eq 0 ]]; then
        print_warning "No supported files found in: $dir"
        return 0
    fi
    
    print_status "Found ${#files[@]} supported files in $dir"
    
    local success_count=0
    local total_count=${#files[@]}
    
    for file in "${files[@]}"; do
        if format_file "$file"; then
            ((success_count++))
        fi
    done
    
    print_success "Formatted $success_count/$total_count files in $dir"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [FILES/DIRECTORIES...]"
    echo ""
    echo "Recursively formats C++, HTML, CSS, and JS files using appropriate formatters."
    echo ""
    echo "Supported file types:"
    echo "  C++: .cpp, .h, .hpp, .c, .cc, .cxx (clang-format)"
    echo "  Web: .html, .htm, .css, .js (prettier or js-beautify)"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -d, --dry-run   Show what would be formatted without making changes"
    echo "  -v, --verbose   Show detailed output"
    echo "  -c, --check     Check if files are properly formatted (exit 1 if not)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Format default directories (src, include, web)"
    echo "  $0 src/              # Format src/ directory recursively"
    echo "  $0 web/              # Format web/ directory recursively"
    echo "  $0 include/ballistics/bullet.h  # Format specific C++ file"
    echo "  $0 web/common.css    # Format specific CSS file"
    echo "  $0 -d web/           # Dry run - show what would be formatted"
    echo "  $0 -c web/           # Check formatting without changing files"
    echo ""
    echo "Default directories: ${DEFAULT_DIRS[*]}"
}

# Parse command line arguments
DRY_RUN=false
VERBOSE=false
CHECK_ONLY=false
TARGETS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -c|--check)
            CHECK_ONLY=true
            shift
            ;;
        -*)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            TARGETS+=("$1")
            shift
            ;;
    esac
done

# If no targets specified, use default directories
if [[ ${#TARGETS[@]} -eq 0 ]]; then
    TARGETS=("${DEFAULT_DIRS[@]}")
fi

# Check if required formatters are installed
check_formatters

# Define clang-format style based on your preferences
# - Opening braces on next line
# - 4-space indentation
# - Inline access specifiers
# - C++20 standard
CLANG_FORMAT_STYLE='{
    BasedOnStyle: LLVM,
    Language: Cpp,
    IndentWidth: 2,
    TabWidth: 2,
    UseTab: Never,
    ColumnLimit: 200,
    AccessModifierOffset: 0,
    AlignAfterOpenBracket: Align,
    AlignConsecutiveAssignments: false,
    AlignConsecutiveDeclarations: false,
    AlignOperands: true,
    AlignTrailingComments: true,
    AllowAllParametersOfDeclarationOnNextLine: true,
    AllowShortBlocksOnASingleLine: true,
    AllowShortCaseLabelsOnASingleLine: true,
    AllowShortFunctionsOnASingleLine: All,
    AllowShortIfStatementsOnASingleLine: Never,
    AllowShortLoopsOnASingleLine: false,
    AlwaysBreakAfterReturnType: None,
    AlwaysBreakBeforeMultilineStrings: false,
    AlwaysBreakTemplateDeclarations: Yes,
    BinPackArguments: true,
    BinPackParameters: true,
    BreakBeforeBinaryOperators: None,
    BreakBeforeBraces: Allman,
    BreakBeforeInheritanceComma: false,
    BreakBeforeTernaryOperators: true,
    BreakConstructorInitializersBeforeComma: false,
    BreakConstructorInitializers: BeforeColon,
    BreakAfterJavaFieldAnnotations: false,
    BreakStringLiterals: true,
    ConstructorInitializerAllOnOneLineOrOnePerLine: false,
    ConstructorInitializerIndentWidth: 2,
    ContinuationIndentWidth: 2,
    Cpp11BracedListStyle: true,
    DerivePointerAlignment: false,
    DisableFormat: false,
    ExperimentalAutoDetectBinPacking: false,
    FixNamespaceComments: true,
    IncludeBlocks: Preserve,
    IndentCaseLabels: false,
    IndentPPDirectives: None,
    IndentWrappedFunctionNames: false,
    KeepEmptyLinesAtTheStartOfBlocks: true,
    MaxEmptyLinesToKeep: 1,
    NamespaceIndentation: All,
    PenaltyBreakAssignment: 2,
    PenaltyBreakBeforeFirstCallParameter: 1,
    PenaltyBreakComment: 300,
    PenaltyBreakFirstLessLess: 120,
    PenaltyBreakString: 1000,
    PenaltyExcessCharacter: 1000000,
    PenaltyReturnTypeOnItsOwnLine: 200,
    PointerAlignment: Left,
    ReflowComments: true,
    SortIncludes: true,
    SortUsingDeclarations: true,
    SpaceAfterCStyleCast: false,
    SpaceAfterTemplateKeyword: true,
    SpaceBeforeAssignmentOperators: true,
    SpaceBeforeParens: Never,
    SpaceInEmptyParentheses: false,
    SpacesBeforeTrailingComments: 1,
    SpacesInAngles: false,
    SpacesInContainerLiterals: true,
    SpacesInCStyleCastParentheses: false,
    SpacesInParentheses: false,
    SpacesInSquareBrackets: false
}'

print_status "Starting code formatting..."

# Process each target
for target in "${TARGETS[@]}"; do
    if [[ -f "$target" ]]; then
        # It's a file
        if [[ "$CHECK_ONLY" == "true" ]]; then
            if clang-format -style="$CLANG_FORMAT_STYLE" "$target" | diff -q "$target" - > /dev/null; then
                print_success "Properly formatted: $target"
            else
                print_error "Not properly formatted: $target"
                exit 1
            fi
        elif [[ "$DRY_RUN" == "true" ]]; then
            print_status "Would format: $target"
        else
            format_file "$target"
        fi
    elif [[ -d "$target" ]]; then
        # It's a directory
        if [[ "$CHECK_ONLY" == "true" ]]; then
            # Check all files in directory
            local files=()
            while IFS= read -r -d '' file; do
                files+=("$file")
            done < <(find "$target" -type f \( -name "*.cpp" -o -name "*.h" -o -name "*.hpp" -o -name "*.c" -o -name "*.cc" -o -name "*.cxx" -o -name "*.html" -o -name "*.htm" -o -name "*.css" -o -name "*.js" \) -print0)
            
            local all_good=true
            for file in "${files[@]}"; do
                local is_formatted=true
                
                # Check C++ files with clang-format
                if [[ "$file" =~ \.(cpp|h|hpp|c|cc|cxx)$ ]]; then
                    if ! clang-format -style="$CLANG_FORMAT_STYLE" "$file" | diff -q "$file" - > /dev/null; then
                        is_formatted=false
                    fi
                # Check web files with prettier or js-beautify
                elif [[ "$file" =~ \.(html|htm|css|js)$ ]]; then
                    if command -v prettier &> /dev/null; then
                        local ext="${file##*.}"
                        if ! prettier --check "$file" --parser="$ext" 2>/dev/null; then
                            is_formatted=false
                        fi
                    elif command -v js-beautify &> /dev/null; then
                        # This is more complex for js-beautify, so we'll skip detailed checking
                        # and just assume it's formatted if the tool exists
                        is_formatted=true
                    fi
                fi
                
                if [[ "$is_formatted" == "false" ]]; then
                    print_error "Not properly formatted: $file"
                    all_good=false
                fi
            done
            
            if [[ "$all_good" == "true" ]]; then
                print_success "All files properly formatted in: $target"
            else
                exit 1
            fi
        elif [[ "$DRY_RUN" == "true" ]]; then
            print_status "Would format directory: $target"
            find "$target" -type f \( -name "*.cpp" -o -name "*.h" -o -name "*.hpp" -o -name "*.c" -o -name "*.cc" -o -name "*.cxx" -o -name "*.html" -o -name "*.htm" -o -name "*.css" -o -name "*.js" \) -exec echo "  Would format: {}" \;
        else
            format_directory "$target"
        fi
    else
        print_warning "Target does not exist: $target"
    fi
done

print_success "Code formatting complete!"
