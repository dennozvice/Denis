# Motore veloce di Specchio iPhone: la finestra "specchio" basata su ipb (MIT, vedi LICENSE-ipb).
# Serve Xcode 27 (selezionato con xcode-select o indicato con XCODE_PATH=/percorso/Xcode.app).
XCODE_PATH ?= $(patsubst %/Contents/Developer,%,$(shell xcode-select -p))
SDK_PRIVATE_FRAMEWORKS := $(XCODE_PATH)/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/System/Library/PrivateFrameworks

BUILD_DIR := build
SOURCES_DIR := Sources
MIRROR_TARGET := $(BUILD_DIR)/specchio-mirror

GLUE := \
	$(BUILD_DIR)/mercury_glue.o \
	$(BUILD_DIR)/mercury_abi.o \
	$(BUILD_DIR)/universalhid_glue.o \
	$(BUILD_DIR)/universalhid_abi.o \
	$(BUILD_DIR)/uhid_request_abi.o

FRAMEWORK_PATHS := \
	-F/Library/Developer/PrivateFrameworks \
	-F/Library/Developer/PrivateFrameworks/CoreDevice.framework/Frameworks \
	-F/Library/Apple/System/Library/PrivateFrameworks \
	-F$(SDK_PRIVATE_FRAMEWORKS)

.PHONY: all clean

all: $(MIRROR_TARGET)

$(BUILD_DIR):
	mkdir -p $@

$(BUILD_DIR)/mercury_abi.o: $(SOURCES_DIR)/mercury_abi.S | $(BUILD_DIR)
	clang -c $< -o $@

$(BUILD_DIR)/universalhid_abi.o: $(SOURCES_DIR)/universalhid_abi.S | $(BUILD_DIR)
	clang -c $< -o $@

$(BUILD_DIR)/uhid_request_abi.o: $(SOURCES_DIR)/uhid_request_abi.S | $(BUILD_DIR)
	clang -c $< -o $@

$(BUILD_DIR)/mercury_glue.o: $(SOURCES_DIR)/mercury_glue.swift | $(BUILD_DIR)
	swiftc -parse-as-library -c $< -o $@

$(BUILD_DIR)/universalhid_glue.o: $(SOURCES_DIR)/universalhid_glue.swift | $(BUILD_DIR)
	swiftc -parse-as-library -c $< -o $@

$(BUILD_DIR)/mirror.o: $(SOURCES_DIR)/mirror.m | $(BUILD_DIR)
	clang -fobjc-arc -fblocks -Wall -Wextra -Wno-unused-parameter \
		-Wno-deprecated-declarations -c $< -o $@

$(MIRROR_TARGET): $(BUILD_DIR)/mirror.o $(GLUE)
	swiftc $^ -o $@ \
		$(FRAMEWORK_PATHS) \
		-framework Foundation -framework CoreFoundation \
		-framework AppKit -framework AVFoundation -framework QuartzCore -framework CoreImage \
		-framework CoreMedia -framework CoreVideo \
		-framework CoreDevice -framework CoreDeviceUtilities \
		-framework RemoteXPC -framework Mercury -framework UniversalHID \
		-Xlinker -undefined -Xlinker dynamic_lookup

clean:
	rm -rf $(BUILD_DIR)
