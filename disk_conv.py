#!env python
import sys,argparse,struct,textwrap,os,os.path
emacs=os.getenv("EMACS") is not None

##########################################################################
##########################################################################

can_convert_basic=False
try:
    import BBCBasicToText
    can_convert_basic=True
except ImportError: pass

##########################################################################
##########################################################################

def fatal(str):
    sys.stderr.write("FATAL: %s"%str)
    if str[-1]!='\n': sys.stderr.write("\n")
    
    if emacs: raise RuntimeError
    else: sys.exit(1)

##########################################################################
##########################################################################

g_verbose=False

def v(str):
    global g_verbose
    
    if g_verbose:
        sys.stdout.write(str)
        sys.stdout.flush()

##########################################################################
##########################################################################

# 65 link attrs are 8 if locked

convert_to_65link_char={
    " ":"_sp",
    "!":"_xm",
    "\"":"_dq",
    "#":"_ha",
    "$":"_do",
    "%":"_pc",
    "&":"_am",
    "'":"_sq",
    "(":"_rb",
    ")":"_lb",
    "*":"_as",
    "+":"_pl",
    ",":"_cm",
    "-":"_mi",
    ".":"_pd",
    "/":"_fs",
    ":":"_co",
    ";":"_sc",
    "<":"_st",
    "=":"_eq",
    ">":"_lt",
    "?":"_qm",
    "@":"_at",
    "[":"_hb",
    "\\":"_bs",
    "]":"_bh",
    "^":"_po",
    "_":"_un",
    "`":"_bq",
    "{":"_cb",
    "|":"_ba",
    "}":"_bc",
    "~":"_no",
}

# \ / : * ? " < > |
bad_windows_chars="\\=:*?\"<>|"

def convert_to_windows(beeb_name):
    result=""
    for c in beeb_name:
        if c in bad_windows_chars:
            result+=convert_to_65link_char[c]
        else:
            result+=c
    return result

class Disc:
    def __init__(self,
                 num_sides,
                 num_tracks,
                 num_sectors,
                 data):
        self.num_sides=num_sides
        self.num_tracks=num_tracks
        self.num_sectors=num_sectors
        self.data=[ord(x) for x in data]

    def read(self,
             side,
             track,
             sector,
             offset):
        return self.data[self.get_index(side,track,sector,offset)]

    def read_string(self,
                    side,
                    track,
                    sector,
                    offset,
                    count):
        return "".join([chr(x) for x in [self.read(side,track,sector,offset+i) for i in range(count)]])

#     def write(self,
#               side,
#               track,
#               sector,
#               offset,
#               value):
#         self.data[self.get_index(side,track,sector,offset)]=value

    def get_index(self,
                  side,
                  track,
                  sector,
                  offset):
        assert side>=0 and side<self.num_sides
        assert track>=0 and track<self.num_tracks
        assert sector>=0 and sector<self.num_sectors
        assert offset>=0 and offset<256

        index=(track*self.num_sides+side)*(self.num_sectors*256)
        index+=sector*256
        index+=offset

        return index

# def load_ds_disc(name):
#     f=open(name,"rb")
#     data=f.read()
#     f.close()

#     return Disc(2,80,10,data)

def mkdir(dir_name):
    try:
        os.makedirs(dir_name)
    except:
        # assume it's nothing serious...
        pass

def main(options):
    global g_verbose
    g_verbose=options.verbose

    global emacs
    if options.not_emacs: emacs=False

    # Figure out disc sidedness.
    ext=os.path.splitext(options.fname)[1]
    if os.path.normcase(ext)==os.path.normcase(".ssd"): num_sides=1
    elif os.path.normcase(ext)==os.path.normcase(".dsd"): num_sides=2
    else: fatal("unrecognised extension: %s"%ext)

    # Figure out where to put files.
    dest_dir=options.dest_dir
    if dest_dir is None:
        dest_dir=os.path.join(os.path.dirname(options.fname))

    dest_dir=os.path.join(dest_dir,
                          os.path.splitext(os.path.basename(options.fname))[0])

    # 65Link barfs if there's no drive 2, so always create both.
    mkdir(os.path.join(dest_dir,"0"))
    mkdir(os.path.join(dest_dir,"2"))

    # Load the image
    with open(options.fname,"rb") as f: image=Disc(num_sides,80,10,f.read())
    
    for side in range(num_sides):
        drive=side*2

        title=(image.read_string(side,0,0,0,8)+image.read_string(side,0,1,0,4)).replace(chr(0),"")

        num_files=image.read(side,0,1,5)>>3
        option=(image.read(side,0,1,6)>>4)&3

        v("Side %d: \"%s\": Option %d, %d files\n"%(side,title,option,num_files))

        for file_idx in range(num_files):
            offset=8+file_idx*8
            
            name=image.read_string(side,0,0,offset,7).rstrip()
            dir=image.read(side,0,0,offset+7)

            locked=(dir&0x80)!=0
            dir=chr(dir&0x7F)

            load=(image.read(side,0,1,offset+0)<<0)|(image.read(side,0,1,offset+1)<<8)
            exec_=(image.read(side,0,1,offset+2)<<0)|(image.read(side,0,1,offset+3)<<8)
            length=(image.read(side,0,1,offset+4)<<0)|(image.read(side,0,1,offset+5)<<8)
            start=image.read(side,0,1,offset+7)

            topbits=image.read(side,0,1,offset+6)

            if (topbits>>6)&3:
                # but there are two bits, so what are you supposed to do?
                exec_|=0xFFFF0000

            length|=((topbits>>4)&3)<<16

            if (topbits>>2)&3:
                # but there are two bits, so what are you supposed to do?
                load|=0xFFFF0000

            start|=((topbits>>0)&3)<<8

            # Grab contents of this file
            contents=[]
            for i in range(length):
                byte_sector=start+i/256
                byte_offset=i%256
                
                contents.append(image.read(side,byte_sector/10,byte_sector%10,byte_offset))

            # Does it look like it could be a BASIC program?
            basic=False
            if options.basic and len(contents)>0:
                i=0
                while True:
                    if i>=len(contents):
                        break

                    if contents[i]!=0x0D:
                        break

                    if i+1>=len(contents):
                        break

                    if contents[i+1]==0xFF:
                        basic=True
                        break

                    if i+3>=len(contents):
                        break

                    if contents[i+3]==0:
                        break
                    
                    i+=contents[i+3]#skip rest of line
                    

            # *INFO
            v("%s.%-7s %c %08X %08X %08X (T%d S%d)%s\n"%(dir,
                                                         name,
                                                         "L" if locked else " ",
                                                         load,
                                                         exec_,
                                                         length,
                                                         start/10,
                                                         start%10,
                                                         " (BASIC)" if basic else ""))

            #
            contents_str="".join([chr(x) for x in contents])

            # Write 65link copy.
            sfl_folder=os.path.join(dest_dir,"%d"%drive)

            sfl_file_name="%s%s"%(convert_to_65link_char.get(dir,dir),
                                  "".join([convert_to_65link_char.get(c,c) for c in name]))

            f=open(os.path.join(sfl_folder,
                                sfl_file_name)+".lea","wb")
            f.write(struct.pack("<III",load,exec_,8 if locked else 0))
            f.close()

            f=open(os.path.join(sfl_folder,
                                sfl_file_name),"wb")
            f.write(contents_str)
            f.close()

            # Write PC copy.
            if basic:
                raw_folder=os.path.join(dest_dir,"raw/%d"%drive)
                mkdir(raw_folder)
                
                raw_file_name="%s.%s"%(convert_to_windows(dir),
                                       convert_to_windows(name))
                
                decoded=BBCBasicToText.Decode(contents_str)
                for wrap in [False]:
                    ext=".wrap.txt" if wrap else ".txt"
                    f=open(os.path.join(raw_folder,
                                        "%s%s"%(raw_file_name,ext)),
                           "wb")
                    # Produce output like the BASIC Editor (readability
                    # not guaranteed)
                    for num,text in decoded:
                        wrapped=textwrap.wrap(text,64 if wrap else 65536)
                        num_text="%5d "%num
                        for i in range(len(wrapped)):
                            print>>f,"%s%s"%(num_text if i==0 else " "*len(num_text),
                                             wrapped[i])
                    f.close()

##########################################################################
##########################################################################

if __name__=="__main__":
    parser=argparse.ArgumentParser(description="make 65link folder from BBC disk image")
    
    parser.add_argument("-v",
                        "--verbose",
                        action="store_true",
                        help="be more verbose")

    parser.add_argument("--not-emacs",
                        action="store_true",
                        help="assume not running under emacs")

    if can_convert_basic:
        parser.add_argument("-b",
                            "--basic",
                            action="store_true",
                            help="find tokenized BASIC source files and save text copies")
                        
    parser.add_argument("-d",
                        "--dest-dir",
                        default=None,
                        metavar="DIR",
                        help="where to put files (will use disc image folder if not specified)")

    parser.add_argument("fname",
                        metavar="FILE",
                        help="name of disc to convert")

    args=sys.argv[1:]

    options=parser.parse_args(args)

    if not can_convert_basic: options.basic=False
    
    main(options)
    
#auto_convert("Z:\\beeb\\beebcode\\A5022201.DSD",True)
