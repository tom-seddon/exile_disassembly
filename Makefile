ifeq ($(OS),Windows_NT)
PYTHON:=py -3
else
PYTHON:=python3
endif

##########################################################################
##########################################################################

_V:=$(if $(VERBOSE),,@)
__VERBOSE:=$(if $(VERBOSE),--verbose,)
SHELLCMD:=$(PYTHON) "submodules/shellcmd.py/shellcmd.py"
BEEBASM:=beebasm

##########################################################################
##########################################################################

TMP:=./tmp

##########################################################################
##########################################################################

.PHONY:build
build:
	$(_V)$(SHELLCMD) mkdir "$(TMP)"
	$(_V)$(BEEBASM) -v -i "exileb.6502" -do "$(TMP)/exileb.ssd" >"$(TMP)/exileb.lst"
	$(_V)$(PYTHON) "submodules/beeb/bin/ssd_extract.py" $(__VERBOSE) -o "$(TMP)" "$(TMP)/exileb.ssd"
	$(_V)$(SHELLCMD) concat -o "$(TMP)/exileb.new" "$(TMP)/exileb/0/B.MAIN" "$(TMP)/exileb/0/B.INTRO"

	$(_V)$(BEEBASM) -v -i "exilemc.6502" -do "$(TMP)/exilemc.ssd" > "$(TMP)/exilemc.lst"
	$(_V)$(PYTHON) "submodules/beeb/bin/ssd_extract.py" $(__VERBOSE) -o "$(TMP)" "$(TMP)/exilemc.ssd"
	$(_V)$(SHELLCMD) concat -o "$(TMP)/exilemc.new" "$(TMP)/exilemc/0/S.RAM" "$(TMP)/exilemc/0/S.ROM" "$(TMP)/exilemc/0/S.INIT2" "$(TMP)/exilemc/0/S.INIT"

	$(_V)$(SHELLCMD) sha1 "$(TMP)/exileb.new"
	$(_V)$(SHELLCMD) sha1 "$(TMP)/exilemc.new"

##########################################################################
##########################################################################

.PHONY:clean
clean:
	$(_V)$(SHELLCMD) rm-tree "$(TMP)"
