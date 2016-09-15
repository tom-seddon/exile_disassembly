#!/usr/bin/python
import argparse,sys,glob

##########################################################################
##########################################################################

def dump(f,options):
    offset=0

    cols=range(options.cols)

    while 1:
        row=f.read(options.cols)

        if row=="":
            break

        line="%08X: %s  %s\n"%(offset+options.base,
                               " ".join(["%02X"%ord(row[i]) if i<len(row) else "  " for i in cols]),
                               "".join([(row[i] if ord(row[i])>=32 and ord(row[i])<=126 else ".") if i<len(row) else " " for i in cols]))
        
        sys.stdout.write(line)

        offset+=options.cols

##########################################################################
##########################################################################

def main(options):
    # file_names=[]
    # for arg in args:
    #     file_names+=glob.glob(arg)

    # if len(file_names)==0:
    #     sys.stderr.write("FATAL: given name(s) don't appear to match any file(s).")
    #     sys.exit(1)

    try:
        if options.file=="-": dump(sys.stdin,options)
        else:
            with open(options.file,"rb") as f: dump(f,options)
    except IOError,e:
        if e.errno==32:
            # Broken pipe. Just ignore this.
            pass
        else:
            raise

##########################################################################
##########################################################################

# http://stackoverflow.com/questions/25513043/python-argparse-fails-to-parse-hex-formatting-to-int-type
def auto_int(x): return int(x,0)

if __name__=="__main__":
    parser=argparse.ArgumentParser()

    parser.add_argument("-c","--cols",dest="cols",metavar="COLS",default=16,help="set number of columns to COLS")
    parser.add_argument("-b","--base",default=0,type=auto_int,help="base address for offsets")
    parser.add_argument("file",metavar="FILE",help="file to dump")

    main(parser.parse_args(sys.argv[1:]))
