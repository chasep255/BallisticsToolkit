# Code Formatting Setup

This project supports automatic formatting for C++, HTML, CSS, and JavaScript files.

## Installation

### Option 1: Prettier (Recommended)
```bash
# Install npm if not already installed
sudo apt install npm

# Install prettier globally
npm install -g prettier
```

### Option 2: js-beautify (Alternative)
```bash
# Install js-beautify
sudo apt install jsbeautifier
```

### Required for C++ formatting
```bash
# Install clang-format
sudo apt install clang-format
```

## Usage

### Format all files (default directories: src, include, web)
```bash
./format.sh
```

### Format specific directory
```bash
./format.sh web/
./format.sh src/
```

### Format specific file
```bash
./format.sh web/common.css
./format.sh src/trajectory.cpp
```

### Check formatting without changing files
```bash
./format.sh -c web/
```

### Dry run (see what would be formatted)
```bash
./format.sh -d web/
```

## Supported File Types

- **C++**: `.cpp`, `.h`, `.hpp`, `.c`, `.cc`, `.cxx` (clang-format)
- **HTML**: `.html`, `.htm` (prettier or html-beautify)
- **CSS**: `.css` (prettier or css-beautify)
- **JavaScript**: `.js` (prettier or js-beautify)

## Configuration

- **C++**: Uses custom clang-format style with 2-space indentation
- **Web**: Uses prettier defaults or js-beautify defaults

## Integration

The format script is automatically called during the build process and can be integrated into your development workflow.
