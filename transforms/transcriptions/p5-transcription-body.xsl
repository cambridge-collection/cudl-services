<?xml version="1.0"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:mml="http://www.w3.org/1998/Math/MathML"
  xmlns:tei="http://www.tei-c.org/ns/1.0"
  xmlns:functx="http://www.functx.com"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:teix="http://www.tei-c.org/ns/Examples"
  xmlns:cudl="http://cudl.cam.ac.uk/xtf/"
  xmlns="http://www.w3.org/1999/xhtml"
  exclude-result-prefixes="#all">
  
  <xsl:preserve-space elements="teix:*"/>

  <xsl:include href="p5-functions-and-named-templates.xsl"/>
  <!-- variables needed to be defined for this sheet and included to be self-
       contained:
       viewMode: diplomatic|normalised
       inTextMode: true()
   -->
  
  <xsl:key name="milestones_id" match="tei:div//tei:pb|tei:div//tei:cb|tei:div//tei:milestone" use="concat('#',@xml:id)"/>
  <xsl:key name="milestones_sameAs" match="tei:div//tei:pb|tei:div//tei:cb|tei:div//tei:milestone" use="@sameAs"/>
  
  <xsl:variable name="special_app_children" select="('handShift','lacunaStart','lacunaEnd','witStart','witEnd')"/>
  
  <xsl:variable name="witnesses" select="$listWit/tei:witness/concat('#',@xml:id)"/>
  
  <xsl:variable name="witness_names" as="item()+">
    <xsl:for-each select="$witnesses">
      <xsl:variable name="id" select="."/>
      
      <xsl:variable name="idno" select="$listWit/tei:witness[@xml:id=replace($id,'^#','')]/tei:msDesc/tei:msIdentifier[1]/tei:idno" as="node()"/>
      <xsl:variable name="short_name" select="replace(string-join($idno//text(),''),'^([^,]+),.*$','$1')"/>
      <xsl:element name="idno">
        <xsl:attribute name="short_name" select="$short_name"/>
        <xsl:attribute name="pointer_to" select="$id"/>
        <xsl:call-template name="apply-mode-to-templates">
          <xsl:with-param name="displayMode" select="$viewMode"/>
          <xsl:with-param name="node" select="$idno"/>
        </xsl:call-template>
      </xsl:element>
    </xsl:for-each>
  </xsl:variable>
  
  <xsl:variable name="listWit" select="/tei:TEI/tei:teiHeader/tei:fileDesc/tei:sourceDesc/tei:listWit"/>

  <xsl:variable name="hands" as="item()*">
    <xsl:for-each select="/tei:TEI/tei:teiHeader/tei:profileDesc/tei:handNotes/tei:handNote">
      <xsl:variable name="handNote" select="."/>
      <xsl:element name="handNote">
        <xsl:attribute name="pointer_to" select="$handNote/(concat('#',@xml:id),@sameAs)[.!='#'][1]"/>
        <xsl:call-template name="apply-mode-to-templates">
          <xsl:with-param name="displayMode" select="$viewMode"/>
          <xsl:with-param name="node" select="$handNote"/>
        </xsl:call-template>
      </xsl:element>
    </xsl:for-each>
  </xsl:variable>
  
  <xsl:template match="tei:body" mode="diplomatic normalised">
    <div class="body">
      <xsl:apply-templates mode="#current"/>
    </div>
    <xsl:call-template name="endnote"/>
  </xsl:template>


<!-- Basic Blocks -->
  <xsl:template match="tei:div" mode="#all">
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <div>
          <xsl:call-template name="add-attr-if-exists">
            <xsl:with-param name="name" select="'id'"/>
            <xsl:with-param name="value" select="@xml:id"/>
          </xsl:call-template>
          <xsl:call-template name="add-attr-if-exists">
            <xsl:with-param name="name" select="'class'"/>
            <xsl:with-param name="value" select="@rend"/>
          </xsl:call-template>
          <xsl:apply-templates mode="#current"/>
        </div>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  
  <!-- This template is explicitly only numbering paragraphs that occur within tei:text
       and which are NOT contained within notes
  -->
  <xsl:template match="tei:text//tei:p" mode="#all">
    <xsl:variable name="paraAnchor">
      <xsl:text>para</xsl:text>
      <xsl:number format="1" level="any" count="tei:text//tei:p[not(ancestor::tei:note)]"/>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <p>
          <xsl:if test="not(ancestor::tei:note)">
            <xsl:call-template name="add-attr-if-exists">
              <xsl:with-param name="name" select="'id'"/>
              <xsl:with-param name="value" select="((normalize-space(@xml:id),$paraAnchor)[.!=''])[1]"/>
            </xsl:call-template>
          </xsl:if>
          <xsl:attribute name="class" select="cudl:rendPara(@rend)" />
          <xsl:apply-templates mode="#current"/>
        </p>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="tei:head[not(ancestor::tei:figure)]" mode="#all">
    <xsl:variable name="headAnchor">
      <xsl:text>head</xsl:text>
      <xsl:number format="1" count="tei:head[not(ancestor::tei:note)]" level="any"/>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <!-- This variable offsets the count of the header in html BECAUSE transcriptions contain metatadat with an h1 already-->
        <xsl:variable name="header_offset">
          <xsl:choose>
            <xsl:when test="$inTextMode">1</xsl:when>
            <xsl:otherwise>0</xsl:otherwise>
          </xsl:choose>
        </xsl:variable>

        <xsl:variable name="classname">
          <xsl:text> </xsl:text>
          <xsl:value-of select="cudl:rendPara(@rend)"/>
        </xsl:variable>

        <xsl:variable name="level" select="count(ancestor::tei:div)"/>
        <xsl:variable name="header_number">
          <xsl:choose>
            <xsl:when test="($level+number($header_offset)) > 6">
              <xsl:text>6</xsl:text>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="$level+number($header_offset)"/>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:variable>
        <xsl:element name="h{$header_number}">
          <xsl:if test="not(ancestor::tei:note)">
            <xsl:call-template name="add-attr-if-exists">
              <xsl:with-param name="name" select="'id'"/>
              <xsl:with-param name="value" select="((normalize-space(@xml:id),$headAnchor)[.!=''])[1]"/>
            </xsl:call-template>
          </xsl:if>
          <xsl:attribute name="class" select="normalize-space($classname)"/>
          <xsl:apply-templates mode="#current"/>
        </xsl:element>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <!-- Linking -->
  <!-- TODO: This template will need to be rewritten or abandoned utterly in CUDL
             since I doubt I could link directly to a case
  -->
  <xsl:template match="tei:ref[@type='case']" mode="#all">
    <!--<a href="/view/case/{$viewMode}/{@target}">-->
      <xsl:apply-templates mode="#current"/>
    <!--</a>-->
  </xsl:template>

  <xsl:template match="tei:rdg[not(@type=('substantive', 'hisubs'))]" mode="#default normalised diplomatic"/>

  <xsl:template match="tei:choice[not(tei:unclear)]" mode="#default diplomatic normalised">
    <xsl:apply-templates mode="#current"/>
  </xsl:template>

  <xsl:template match="tei:choice[tei:unclear][count(child::*[local-name()!='unclear'])=0]" mode="#default diplomatic normalised">
    <span class="app" title="The editor is uncertain which of these possible readings is the correct one">
      <span class="delim">[</span>
      <xsl:for-each select="tei:unclear">
        <xsl:apply-templates select="." mode="#current" />
        <xsl:if test="position() ne last()">
          <xsl:text>&#160;</xsl:text>
          <span class="delim">
            <xsl:text>|</xsl:text>
          </span>
          <xsl:text>&#160;</xsl:text>
        </xsl:if>
      </xsl:for-each>
      <span class="delim">]</span>
    </span>
  </xsl:template>

  <xsl:template match="tei:supplied" mode="#all">
    <xsl:variable name="title">
      <xsl:choose>
        <xsl:when test="not(@source)">
          <xsl:text>This text has been supplied by the editor</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:text>This text has been supplied by </xsl:text>
          <xsl:value-of select="@source"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:variable>
    <span class="supplied" title="{$title}">
      <span class="delim">[</span>
      <xsl:apply-templates mode="#current"/>
      <span class="delim">]</span>
    </span>
  </xsl:template>

  <!-- Copy mathML directly into final document. It will either be displayed natively or parsed and displayed using mathJax.js -->
  <xsl:template match="tei:formula" mode="#all"><xsl:copy-of select="*" copy-namespaces="no"/></xsl:template>

  <!-- Images -->
  
  <!-- NB: figure/@type is used to record the presence of charts within the case files and it should not be acted upon -->
  <xsl:template match="tei:figure[@type]" mode="#all" />
  
  <!-- TODO: This code needs to be rewritten so that it's less
             preoccupied with staying within the grid layout of the 
             old Casebooks site.
             It's not a high priority right now since there aren't
             ANY elements in the CDL Data that contain figure with
             a child
  -->
  <xsl:template match="tei:figure[not(@type)][*]" mode="#all">
    <xsl:variable name="width_val">
      <xsl:variable name="grid_size" select="floor((number(replace(tei:graphic/@width,'px',''))+20) div 80)" />
      <xsl:choose>
        <xsl:when test="@rend">
          <xsl:choose>
            <xsl:when test="$grid_size !=12">
              <xsl:text>grid_</xsl:text>
            </xsl:when>
            <xsl:otherwise>
              <xsl:text>container_</xsl:text>
            </xsl:otherwise>
          </xsl:choose>
          <xsl:value-of select="$grid_size"/>
        </xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:variable>
    <xsl:variable name="position">
      <xsl:if test="@rend">
        <xsl:choose>
          <xsl:when test="@rend ='floatLeft'">
            <xsl:text>float left</xsl:text>
          </xsl:when>
          <xsl:when test="@rend ='floatRight'">
            <xsl:text>float right</xsl:text>
          </xsl:when>
          <xsl:when test="@rend ='block'">
            <xsl:text>float left</xsl:text>
          </xsl:when>
          <xsl:when test="@rend ='blockCentered'">
            <xsl:text>blockCentered</xsl:text>
          </xsl:when>
          <xsl:otherwise>
            <xsl:text>float left</xsl:text>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:if>
    </xsl:variable>
    <div>
      <xsl:if test="count(($width_val|$position)[.!=''])>0">
        <xsl:attribute name="class" select="string-join(($width_val,$position,'image'),' ')"/></xsl:if>
      <xsl:if test="@xml:id">
        <xsl:attribute name="id" select="@xml:id"/>
      </xsl:if>
      <img width="{replace(tei:graphic/@width,'px','')}" height="{replace(tei:graphic/@height,'px','')}" src="{tei:graphic/attribute::url}">
        <xsl:variable name="alt">
          <xsl:variable name="figDesc_text">
            <xsl:value-of select="tei:figDesc"/>
          </xsl:variable>
          <xsl:choose>
            <xsl:when test="$figDesc_text!=''">
              <xsl:value-of select="$figDesc_text"/>
            </xsl:when>
            <xsl:otherwise>Figure</xsl:otherwise>
          </xsl:choose>
        </xsl:variable>
        <xsl:attribute name="alt">
          <xsl:value-of select="$alt"/>
        </xsl:attribute>
      </img>
      <xsl:apply-templates mode="#current"/>
    </div>
  </xsl:template>

<xsl:template match="tei:figDesc" mode="#all"/>
  
  <xsl:template match="tei:del[@type = 'redactedBlockStrikethrough']" mode="#all">
        <span class="blockstrike-n" title="This block of text appears to have been censored by the author">
          <span class="color_fix">
            <xsl:apply-templates mode="#current"/>
          </span>
        </span>
  </xsl:template>
  
  <xsl:template match="tei:del[@type = 'redactedCancelled']" mode="#all">
        <span class="cancel-n" title="This text appears to have been censored by the author">
          <span class="color_fix">
            <xsl:apply-templates mode="#current"/>
          </span>
        </span>
  </xsl:template>

  <xsl:template match="tei:gap[not(@reason = ('blotDel', 'del', 'over'))]|
                       tei:gap[@reason = ('blotDel', 'del', 'over')][ancestor::tei:del[contains(@type,'redacted')]]" mode="#all">
    <xsl:variable name="parsedUnit" select="cudl:parseUnit(@unit,@extent)" />
      
    <xsl:variable name="title">
      <xsl:choose>
        <xsl:when test="@reason = 'binding'">
          <xsl:text>Text is illegible because of the binding (Extent: </xsl:text>
          <xsl:value-of select="@extent"/>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$parsedUnit"/>
          <xsl:text>)</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'blot'">
          <xsl:text>Text </xsl:text>
          <xsl:value-of select="cudl:outputCertVerb(@cert)"/>
          <xsl:text> missing due to a blot</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'code'">
          <xsl:text>Text is illegible because it is encoded in an unknown cipher. (Extent: </xsl:text>
          <xsl:value-of select="@extent"/>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$parsedUnit"/>
          <xsl:text>)</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'copy'">
          <xsl:text>Text is illegible due to defective copy</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'damage'">
          <xsl:text>Text is missing due to manuscript damage</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'faded'">
          <xsl:text>Text is illegible because the manuscript is faded</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'foxed'">
          <xsl:text>Text is illegible because the manuscript is foxed</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'hand'">
          <xsl:text>Illegible hand (Extent: </xsl:text>
          <xsl:value-of select="@extent"/>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$parsedUnit"/>
          <xsl:text>)</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'blotDel'">
          <xsl:text>Blot or deletion: </xsl:text>
          <xsl:value-of select="@extent"/>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$parsedUnit"/>
        </xsl:when>
        <xsl:when test="@reason = 'del'">
          <xsl:text>Text is illegible because it is deleted</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'over'">
          <xsl:text>Text is illegible or unclear because it is overwritten</xsl:text>
        </xsl:when>
        <!-- The following are CDL values -->
        <xsl:when test="@reason = 'omitted'">
          <xsl:text>Text is illegible because it is omitted</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'illigble'">
          <xsl:text>Text is illegible</xsl:text>
        </xsl:when>
        <xsl:when test="@reason = 'bleedthrough'">
          <xsl:text>Text is illegible because of bleedthrough</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:text>Text is illegible or missing.</xsl:text>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:variable>

    <span class="gap" title="{$title}">
      <xsl:choose>
        <xsl:when test="tei:desc">
          <xsl:apply-templates mode="#current" />
        </xsl:when>
        <xsl:otherwise>
          <xsl:text>[illeg]</xsl:text>
        </xsl:otherwise>
      </xsl:choose>
    </span>
  </xsl:template>
  
  

  <xsl:template match="tei:foreign" mode="#all">
      <xsl:apply-templates mode="#current"/>
  </xsl:template>

<xsl:template match="tei:fw" mode="#all"/>

  <xsl:template match="tei:hi" mode="#default diplomatic normalised">
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <xsl:choose>
          <xsl:when test="@rend = 'superscript'">
            <sup>
              <xsl:apply-templates mode="#current"/>
            </sup>
          </xsl:when>
          <xsl:when test="@rend = 'subscript'">
            <sub>
              <xsl:apply-templates mode="#current"/>
            </sub>
          </xsl:when>
          <xsl:when test="@rend = 'underline'">
            <em class="underline">
              <xsl:apply-templates mode="#current"/>
            </em>
          </xsl:when>
          <xsl:when test="@rend = 'overline'">
            <span class="overline">
              <xsl:apply-templates mode="#current"/>
            </span>
          </xsl:when>
          <xsl:when test="@rend = ('doubleUnderline','underlineDashed')">
            <em class="{@rend}">
              <xsl:apply-templates mode="#current"/>
            </em>
          </xsl:when>
          <xsl:when test="@rend = 'italic'">
            <em>
              <xsl:apply-templates mode="#current"/>
            </em>
          </xsl:when>
          <xsl:when test="@rend = 'bold'">
            <strong>
              <xsl:apply-templates mode="#current"/>
            </strong>
          </xsl:when>
          <xsl:when test="@rend = ('allCaps', 'dropCap', 'smallCaps')">
            <span class="{lower-case(@rend)}">
              <xsl:apply-templates mode="#current"/>
            </span>
          </xsl:when>
          <xsl:when test="@rend = ('att', 'value', 'val', 'large', 'larger', 'largest', 'small', 'smaller', 'smallest')">
            <span class="{@rend}">
              <xsl:apply-templates mode="#current"/>
            </span>
          </xsl:when>
          <xsl:otherwise>
            <xsl:apply-templates mode="#current"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="tei:lg" mode="#all">
    <xsl:variable name="lgAnchor">
      <xsl:text>lg</xsl:text>
      <xsl:number format="1" level="any" count="tei:text//tei:lg"/>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <div id="{$lgAnchor}" class="{string-join(('lg',cudl:rendPara(@rend)),' ')}">
          <xsl:apply-templates mode="#current"/>
        </div>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="tei:l" mode="#all">
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <p class="{string-join(('line',cudl:rendPara(@rend)),' ')}">
          <xsl:apply-templates mode="#current"/>
        </p>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="tei:num" mode="#all">
    <xsl:apply-templates mode="#current"/>
  </xsl:template>

  <xsl:template match="tei:lb[not(cudl:is_first_significant_child(.))]" mode="#all">
    <br/>
  </xsl:template>
  
  <!-- According to TEI, lb specifies the beginning of the line. That means
       that many projects start of a block element (say a <p>) with an <lb/>
       We likely shouldn't display these initial linebreaks since it introduces
       a superfluous extra line break - one for the block element and another for
       the lb
       There is no reason to check whether lb is the last significant node in a block
       since a terminal br at the end of a block doesn't cause an extra line break
       on the screen
  -->
  <xsl:template match="tei:lb[cudl:is_first_significant_child(.)]" mode="#all"/>
  
  <xsl:template match="tei:list" mode="#all">
    <xsl:variable name="element_name" select="cudl:determine-output-element-name(., 'div')"/>

    <xsl:variable name="listAnchor">
      <xsl:text>list</xsl:text>
      <xsl:number format="1" level="any" count="tei:text//tei:list"/>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <xsl:element name="{$element_name}">
          <xsl:call-template name="add-attr-if-exists">
            <xsl:with-param name="name" select="'id'"/>
            <xsl:with-param name="value" select="((normalize-space(@xml:id),$listAnchor)[.!=''])[1]"/>
          </xsl:call-template>
          <xsl:attribute name="class" select="string-join(('ul',cudl:rendPara(@rend)),' ')"/>
          <xsl:apply-templates mode="#current"/>
        </xsl:element>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  

  <xsl:template match="tei:item" mode="#all">
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <span class="{string-join(('li',cudl:rendPara(@rend)),' ')}">
          <xsl:apply-templates mode="#current"/>
        </span>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="tei:space[@dim='vertical']" mode="#all">
    <br class="verticalspace"/>
  </xsl:template>

  <xsl:template match="tei:space[@dim='horizontal']" mode="#all">
    <xsl:variable name="length">
      <xsl:variable name="length_cleaned" select="replace(@extent,'\?.*$', '')"/>
      <xsl:choose>
        <xsl:when test="$length_cleaned castable as xs:integer">
          <xsl:value-of select="xs:integer($length_cleaned)"/>
        </xsl:when>
        <xsl:otherwise />
      </xsl:choose>
    </xsl:variable>

    <xsl:variable name="unit_text">
      <xsl:choose>
        <xsl:when test="@unit">
          <xsl:value-of select="@unit"/>
        </xsl:when>
        <xsl:otherwise>chars</xsl:otherwise>
      </xsl:choose>
    </xsl:variable>

    <xsl:variable name="message">
      <xsl:choose>
        <xsl:when test="$unit_text='chars' and not(empty($length))">
          <xsl:text>Space for </xsl:text>
          <xsl:value-of select="@extent"/>
          <xsl:text> character</xsl:text>
          <xsl:if test="$length > 1">s</xsl:if>
          <xsl:text> left blank.</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="@extent"/>
          <xsl:text> </xsl:text>
          <xsl:value-of select="$unit_text"/>
          <xsl:text> space left blank.</xsl:text>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:variable>

    <span class="hspac-n" title="{$message}">
      <xsl:variable name="loop_max" select="if (not(empty($length))) then $length else 3"/>
      <xsl:for-each select="1 to $length">
        <xsl:text>&#160;</xsl:text>
      </xsl:for-each>
    </span>
  </xsl:template>
    
  <xsl:template match="tei:milestone[@unit=('question','subsequentInfo','question','judgment','urineInfo','financialInfo','subsequentEventInfo','treatment')]" mode="#all"/>

  <!-- NB: This pb code will fall apart if the page in question contains any page breaks.
           This will happen in lots of transcriptions that take a less facsimile-oriented
           approach to transcription. For example, a single page in a manuscript might have
           an extended addition from multiple pages added in the middle of it via some visual
           marker - check addSpan/anchor documentation.
           Casebooks has numerous instances of this when cases jump from page to page, but
           it isn't an issue right now since such internal page breaks are
           converted to formatted text during the build process, but it is an issue that will
           require a rethink of how the page extractor does its job.
           The solution would either be to add the addSpan/anchor checking to the pageExtractor
            - this will slow it down terribly
           and/or implementing @next and @prev attributes on the casebooks and possibly the 
           newton materials. That would make grabbing the next page break when you request a page
           a simple @xml:id lookup.
           -->
  <xsl:template match="tei:pb[@sameAs|@xml:id][not(@xml:id = $requested_pb/@xml:id)][ancestor::tei:div]|
                       tei:cb[@sameAs|@xml:id][ancestor::tei:div]|
                       tei:milestone[@sameAs|@xml:id][ancestor::tei:div]" mode="diplomatic normalised">
    <xsl:if test="not(@edRef) or tokenize(@edRef,'\s+')=tokenize(@bestText,'\s+')">
      <xsl:variable name="elem" select="."/>
      <xsl:variable name="pageNum">
        <xsl:call-template name="formatPageId">
          <xsl:with-param name="elem" select="if ($elem[@n]) then $elem else if ($elem[@sameAs]) then key('milestones_id', $elem/@sameAs) else ()" />
        </xsl:call-template>
      </xsl:variable>

      <xsl:variable name="element_name" select="cudl:determine-output-element-name(., 'span')" />

      <xsl:variable name="classname">
        <xsl:text>boundaryMarker </xsl:text>
        <xsl:choose>
          <xsl:when test="$element_name= 'span'">
            <xsl:text>inline</xsl:text>
          </xsl:when>
          <xsl:otherwise>
            <xsl:text>pagenum</xsl:text>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:variable>

      <xsl:variable name="bestText_elem">
        <xsl:if test="tokenize(@edRef,'\s+')=tokenize(@bestText,'\s+')">
          <span class="smallcaps">
            <xsl:variable name="unique_wit_names" select="cudl:get_unique_witness_names(tokenize(@edRef,'\s+'))"/>
            <xsl:value-of select="cudl:write_shelfmark_list($unique_wit_names)"/>
          </span>
          <xsl:text>, </xsl:text>
        </xsl:if>
      </xsl:variable>
      <xsl:variable name="optionalSpace">
        <xsl:choose>
          <xsl:when test="not(.//preceding::tei:*[1][name()='lb' and @rend='hyphenated'])">
            <xsl:text> </xsl:text>
          </xsl:when>
          <xsl:otherwise/>
        </xsl:choose>
      </xsl:variable>

      <xsl:if test=".//preceding::tei:*[1][name()='lb' and @rend='hyphenated']">
        <xsl:text>-</xsl:text>
      </xsl:if>
      <xsl:element name="{$element_name}">
        <xsl:attribute name="class" select="normalize-space($classname)"/>
        <xsl:if test="$elem[@xml:id|@sameAs]">
          <xsl:attribute name="id">
            <xsl:choose>
              <xsl:when test="$elem[@xml:id]">
                <xsl:value-of select="$elem/@xml:id"/>
              </xsl:when>
              <xsl:when test="$elem[@sameAs]">
                <xsl:variable name="sameAs_attr" select="@sameAs"/>
                <xsl:variable name="count">
                  <xsl:number format="1" level="any" count="key('milestones_id', $sameAs_attr)|key('milestones_sameAs', $sameAs_attr)"/>
                </xsl:variable>
                <xsl:value-of select="replace($sameAs_attr,'#','')"/>
                <xsl:text>-</xsl:text>
                <xsl:value-of select="$count"/>
              </xsl:when>
            </xsl:choose>
          </xsl:attribute>
        </xsl:if>
        <xsl:value-of select="$optionalSpace"/>
        <xsl:text>&lt;</xsl:text>
        <xsl:copy-of select="$bestText_elem"/>
        <xsl:value-of select="$pageNum"/>
        <xsl:text>&gt;</xsl:text>
        <xsl:value-of select="$optionalSpace"/>
      </xsl:element>
    </xsl:if>
  </xsl:template>

  <xsl:template match="tei:unclear[not(parent::tei:choice[count(child::*[local-name()!='unclear'])=0])]" mode="diplomatic normalised">
    <xsl:choose>
      <xsl:when test="cudl:elem-empty-in-normalised-view(current())"/>
      <xsl:otherwise>
        <span>
          <xsl:attribute name="title">
            <xsl:choose>
              <xsl:when test="@cert = 'high'">
                  <xsl:text>This text is unclear in the manuscript, but the editor is highly confident of the reading.</xsl:text>
              </xsl:when>
              <xsl:when test="@cert = 'medium'">
                  <xsl:text>This text is unclear in the manuscript, but the editor is reasonably confident of the reading.</xsl:text>
              </xsl:when>
              <xsl:when test="@cert = 'low'">
                  <xsl:text>The editor is unsure of this reading because this text is unclear in the manuscript.</xsl:text>
              </xsl:when>
              <xsl:otherwise>
                  <xsl:text>The editor is unsure of this reading because this text is unclear in the manuscript.</xsl:text>
              </xsl:otherwise>
            </xsl:choose>
          </xsl:attribute>
          <xsl:attribute name="class" select="string-join(('unclear',@cert),' ')"/>
          <span class="delim">
            <xsl:text>[</xsl:text>
          </span>
          <xsl:apply-templates mode="#current"/>
          <span class="delim">
            <xsl:text>]</xsl:text>
          </span>
        </span>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  
  <xsl:template match="tei:choice[count(child::*[local-name()!='unclear'])=0]/tei:unclear" mode="diplomatic normalised">
    <span class="{string-join(('unclear', @cert), ' ')}">
      <xsl:apply-templates mode="#current"/>
    </span>
  </xsl:template>


  <xsl:template match="tei:table" mode="#default diplomatic normalised">
    <table>
      <xsl:call-template name="add-attr-if-exists">
        <xsl:with-param name="name" select="'class'"/>
        <xsl:with-param name="value" select="@rend"/>
      </xsl:call-template>
      <xsl:apply-templates mode="#current"/>
    </table>
  </xsl:template>


  <xsl:template match="tei:row" mode="#default diplomatic normalised">
    <tr>
      <xsl:apply-templates mode="#current"/>
    </tr>
  </xsl:template>

  <xsl:template match="tei:cell" mode="#default diplomatic normalised">
    <td class="{cudl:rendPara(@rend)}">
      <xsl:call-template name="add-attr-if-exists">
        <xsl:with-param name="name" select="'colspan'"/>
        <xsl:with-param name="value" select="@cols"/>
      </xsl:call-template>
      <xsl:choose>
        <xsl:when test="@role = 'label'">
          <xsl:element name="b">
            <xsl:apply-templates mode="#current"/>
          </xsl:element>
        </xsl:when>
        <xsl:otherwise>
          <xsl:apply-templates mode="#current"/>
        </xsl:otherwise>
      </xsl:choose>
    </td>
  </xsl:template>

  <xsl:template match="tei:seg[not(ancestor::tei:figure)][not(@rend)]" mode="#all">
    <xsl:apply-templates mode="#current"/>
  </xsl:template>

  <xsl:template match="tei:seg[@rend][not(ancestor::tei:figure)]" mode="#all">
    <span class="{@rend}">
      <xsl:apply-templates mode="#current"/>
    </span>
  </xsl:template>
  
  <xsl:template match="tei:quote|tei:q" mode="#all">
    <!-- CDL puts quotes around the string. Is this a problem of cb?-->
    <xsl:apply-templates mode="#current"/>
  </xsl:template>
    
  <xsl:template  match="text()[not($is_casebooks)]" mode="#all">
    <xsl:analyze-string select="." regex="(&#x00A7;|\^{{2,}}|_ _ _)">
      <xsl:matching-substring>
        <xsl:choose>
          <xsl:when test="matches(.,'&#x00A7;')">
            <xsl:text>&#x30FB;</xsl:text>
          </xsl:when>
          <xsl:when test="matches(.,'\^{2,}')">
            <xsl:text>&#160;&#160;&#160;</xsl:text>
          </xsl:when>
          <xsl:when test="matches(.,'_ _ _')">
            <xsl:text>&#x2014;&#x2014;&#x2014;</xsl:text>
          </xsl:when>
        </xsl:choose>
      </xsl:matching-substring>
      
      <xsl:non-matching-substring>
        <xsl:value-of select="."/>
      </xsl:non-matching-substring>
    </xsl:analyze-string>
  </xsl:template>
  
  <xsl:template  match="text()[$is_casebooks][parent::tei:*]" mode="#all">
    <xsl:variable name="string" select="."/>
    
    <xsl:variable name="cardo">[&#x2e2b;&#x0292;&#x2108;&#x2125;&#x2114;&#xe670;&#xe270;&#xa770;&#xa76b;&#xe8bf;&#xa75b;&#xe8b3;&#xa757;&#x180;&#x1e9c;&#xa75d;&#xa75f;&#xa76d;&#xdf;&#xa76f;&#x204a;&#x0119;&#x271d;&#x211e;&#x2720;&#x2641;&#x25b3;&#x260c;&#x260d;&#x2297;&#x260a;&#x260b;]</xsl:variable>
    <xsl:variable name="newton">[&#x261e;&#x2020;&#x2016;&#xe704;&#xe70d;&#x2652;&#x2648;&#x264c;&#xe002;&#x2653;&#x264f;&#x2649;&#x264d;&#x264a;&#x264b;&#x264e;&#x2650;&#x2651;&#xe714;&#x263e;&#x263e;&#x2640;&#x2640;&#x263f;&#x2609;&#x2609;&#xe739;&#x2642;&#x2642;&#x2643;&#x2643;&#x2644;&#x2644;&#xe704;&#x26b9;&#x25a1;&#xe74e;]</xsl:variable>
    <!-- NB: Is df needed? -->
    <xsl:variable name="df">&#x101;|&#x111;|&#x113;|&#x12b;|m&#x304;|n&#x304;|&#x14d;|&#x16b;|w&#x304;|&#x233;</xsl:variable>
    
    <xsl:analyze-string select="$string" regex="({string-join(($cardo,$newton,$df),'|')})">
      
      <xsl:matching-substring>
        <xsl:choose>
          <xsl:when test="matches(.,$cardo)">
            <span class="cardo"><xsl:value-of select="."/></span>
          </xsl:when>
          <xsl:when test="matches(.,$newton)">
            <span class="ns"><xsl:value-of select="."/></span>
          </xsl:when>
          <xsl:when test="matches(.,$df)">
            <span class="df"><xsl:value-of select="."/></span>
          </xsl:when>
        </xsl:choose>
      </xsl:matching-substring>
      
      <xsl:non-matching-substring>
        <xsl:value-of select="."/>
      </xsl:non-matching-substring>
      
    </xsl:analyze-string>
  </xsl:template>

  
  <!-- For good-looking tree output, we need to include a return after any  text content, assuming we're not inside a paragraph tag. -->
  <xsl:template match="teix:*/text()" mode="#default diplomatic normalised">
    <xsl:if test="not(ancestor::teix:p)" />
    <xsl:value-of select="replace(., '&amp;', '&amp;amp;')"/>
    <xsl:if test="not(ancestor::teix:p) or  not(following-sibling::* or following-sibling::text())" />
  </xsl:template>

<!-- Within the CB collection, none of these elements will occur outside app.
     However, I thought it was worthwhile to include this template in the XSLT
     since it provides for a nice textual message should one ever occur.
-->
  <xsl:template match="tei:lacunaStart[not(ancestor::tei:lem|ancestor::tei:rdg)]|
                       tei:lacunaEnd[not(ancestor::tei:lem|ancestor::tei:rdg)]|
                       tei:witStart[not(ancestor::tei:lem|ancestor::tei:rdg)]|
                       tei:witEnd[not(ancestor::tei:lem|ancestor::tei:rdg)]" mode="diplomatic normalised">
    <xsl:variable name="element_name" select="local-name()"/>
    <xsl:variable name="wit_attr" select="ancestor::*[local-name()=('rdg','lem')][1]/@wit"/>
    <xsl:variable name="noun">
      <xsl:choose>
        <xsl:when test="matches($element_name,'^lacuna')">lacuna</xsl:when>
        <xsl:when test="matches($element_name,'^wit')">witness</xsl:when>
      </xsl:choose>
    </xsl:variable>
    <xsl:variable name="verb">
      <xsl:choose>
        <xsl:when test="matches($element_name,'End$')">ends</xsl:when>
        <xsl:when test="matches($element_name,'Start$')">starts</xsl:when>
      </xsl:choose>
    </xsl:variable>
    <span class="editorialGloss pagenum">
      <xsl:text>&lt;</xsl:text>
      <xsl:text>The </xsl:text>
      <xsl:value-of select="$noun"/>
      <xsl:text> in </xsl:text>
      <xsl:for-each select="tokenize($wit_attr,'\s+')">
        <xsl:variable name="i" select="."/>
        <xsl:if test="not(position()=1)"><xsl:text>, </xsl:text></xsl:if>
        <xsl:value-of select="$witness_names[@pointer_to= $i]/@short_name"/>
      </xsl:for-each>
      <xsl:text> </xsl:text>
      <xsl:value-of select="$verb"/>
      <xsl:text> here</xsl:text>
      <xsl:text>&gt;</xsl:text>
    </span>
  </xsl:template>

  <xsl:template match="tei:handShift[not(ancestor::tei:lem|ancestor::tei:rdg)]|
    tei:handShift[(ancestor::tei:lem|ancestor::tei:rdg)[cudl:contains-text-or-displayable-elem(.)]]" mode="#all">
    <span class="editorialGloss pagenum">
      <xsl:text>&lt;</xsl:text>
      <xsl:value-of select="cudl:write_handShift_msg(., false())"/>
      <xsl:text>&gt;</xsl:text>
    </span>
  </xsl:template>  

  <xsl:template match="tei:text//tei:note" mode="diplomatic normalised">
    <xsl:variable name="noteNumber">
      <xsl:choose>
        <xsl:when test="@type='editorial'">
          <xsl:number format="1" count="tei:text//tei:note[@type='editorial']" level="any"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:number format="1" count="tei:anchor[@xml:id][starts-with(@xml:id, 'n')]|tei:text//tei:note[not(@target) and not(@type='editorial')]" level="any"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:variable>

    <xsl:variable name="noteId">
      <xsl:choose>
        <xsl:when test="@type = 'editorial'">
          <xsl:text>ed</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:text>n</xsl:text>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:value-of select="$noteNumber"/>
    </xsl:variable>

    <xsl:variable name="noteIndicator">
      <xsl:if test="@type = 'editorial'">
        <xsl:text>Editorial&#160;Note&#160;</xsl:text>
      </xsl:if>
      <xsl:value-of select="$noteNumber"/>
    </xsl:variable>

    <xsl:variable name="noteRef">
      <xsl:value-of select="$noteId"/>
      <xsl:text>-ref</xsl:text>
    </xsl:variable>
    
    <xsl:choose>
      <xsl:when test="@target"/>
      <xsl:otherwise>
        <sup class="note" id="{$noteRef}">
          <xsl:value-of select="$noteIndicator"/>
        </sup>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template name="endnote">
    <xsl:if test="/tei:TEI/tei:text//tei:note[not(@target)]">
      <div id="endnotes">
        <p>
          <strong>Notes:</strong>
        </p>
        <xsl:apply-templates select="/tei:TEI/tei:text//tei:note[not(@target)]" mode="footer"/>
      </div>
    </xsl:if>
  </xsl:template>

  <xsl:function name="cudl:rendPara" as="xs:string*">
    <xsl:param name="rend_val"/>
    
    <xsl:variable name="rend" select="tokenize(normalize-space($rend_val),'\s+')[1]"/>
    <!-- Currently only take the first token -->
    <xsl:choose>
      <xsl:when test="$rend=''">
        <xsl:text>paraleft</xsl:text>
      </xsl:when>
      <xsl:when test="$rend = ('indent40','indent35','indent30','indent25','indent20','indent15','indent10','indent5')">
        <xsl:value-of select="$rend"/>
      </xsl:when>
      <xsl:when test="$rend = 'indent0'">
        <xsl:text>noindent</xsl:text>
      </xsl:when>
      <xsl:when test="$rend = 'left'">
        <xsl:text>paraleft</xsl:text>
      </xsl:when>
      <xsl:when test="$rend = 'right'">
        <xsl:text>pararight</xsl:text>
      </xsl:when>
      <xsl:when test="$rend = 'center'">
        <xsl:text>paracenter</xsl:text>
      </xsl:when>
      <xsl:otherwise>
        <xsl:text>paraleft</xsl:text>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:function>
  
  <!-- HERE BE DRAGONS....
       The following code concerns the rendering of TEXT5 - a genetic edition that is comprised of approximately half a dozen
       different manuscripts with all their variant readings coded.
       This code takes that dense transcription and renders the different readings in a concise and (I'm proud to say) aesthetically
       pleasing fashion.
  -->

  <!-- TODO MJH: This text needs changing or updating so that I can present singular and plural messages once the transcription of TEXT5 is completed and it's ready to go live -->
  <xsl:variable name="app_mouseover">This passage contains a variety of readings from different manuscripts</xsl:variable>

 <xsl:template name="construct_app_text">
   <xsl:param name="app"/>

   <xsl:if test="$app[descendant::*[local-name()=$special_app_children]]">
   <xsl:variable name="msg" as="xs:string*">
     <xsl:for-each select="$app//*[local-name()=$special_app_children[not(.='handShift')]]">
       <xsl:value-of select="cudl:write_lacuna_or_witness_msg(., position())"/>
     </xsl:for-each>
   </xsl:variable>
     <xsl:variable name="msg2">
       <xsl:for-each select="$app[(tei:lem|tei:rdg)[(not(cudl:contains-text-or-displayable-elem(.))) or @type[not(.=('substantive', 'hisubs'))]]]//tei:handShift">
         <xsl:sort select="min(for $x in tokenize((ancestor::tei:lem|ancestor::tei:rdg)[1]/@wit,'\s+') return index-of($witnesses,$x))[1]"/>
         <xsl:value-of select="cudl:write_handShift_msg(., true())"/>
       </xsl:for-each>
     </xsl:variable>
     <!-- Strictly speaking, I should do:
       lacunaEnd, witStart first
       then process app (which might have text). The two items there cannot have text before them
       then
       lacunaStart, witEnd.
       The problem will be not repeating the base-text notice. It might have to be get lacuna msg, get base_text message. Output it. Process APP (if texty) then get text of final message. concat it with '.'.
       -->
     <xsl:variable name="final_msg" select="string-join(($msg, $msg2),' ')"/>

     <xsl:if test="$final_msg!=''">
     <span class="editorialGloss pageNum">
       <xsl:text>&lt;</xsl:text>
       <xsl:value-of select="string-join(($msg, $msg2),' ')"/>
       <xsl:text>&gt;</xsl:text>
     </span>
   </xsl:if>
   </xsl:if>
 </xsl:template>

  <!-- app contains special element that is in otherwise empty container:
  Display special message
  Then process app - let templates sort out details
  Must refine xpath:
  app with rdg/lem that contains child but is otherwise empty - no text, no texty empty elements
  -->
  <xsl:template match="tei:app[*[.//*[local-name()=$special_app_children][(not(cudl:contains-text-or-displayable-elem(.))) or @type[not(.=('substantive', 'hisubs'))]]]]" mode="diplomatic normalised" priority="2">
    <xsl:call-template name="construct_app_text">
      <xsl:with-param name="app" select="."/>
    </xsl:call-template>
    <xsl:next-match />
  </xsl:template>

  <!-- App DOES NOT contain special element in otherwise empty container
  Process app - let templates sort out the details
  refine xpath to reflect truly empty container.
  -->
  <xsl:template match="tei:app[not(descendant::*[local-name()=$special_app_children][not(cudl:contains-text-or-displayable-elem(.))])]" mode="normalised diplomatic" priority="2">
    <xsl:next-match />
  </xsl:template>

  <xsl:template match="tei:app[not(tei:rdg[@type=('substantive', 'hisubs')])][tei:lem[not(cudl:contains-text-or-displayable-elem(.))]]" mode="diplomatic normalised" priority="1" />
  
<xsl:template match="tei:lem" mode="diplomatic normalised">
    <xsl:apply-templates mode="#current"/>
  </xsl:template>

  <xsl:template match="tei:rdg" mode="app-rdg-add">
    <xsl:call-template name="apply-mode-to-templates">
      <xsl:with-param name="displayMode" select="$viewMode"/>
      <xsl:with-param name="node" select="*|text()"/>
    </xsl:call-template>
    <xsl:variable name="action">
      <xsl:choose>
        <xsl:when test="cudl:contains-text-or-displayable-elem(.)"><xsl:text>add. </xsl:text></xsl:when>
        <xsl:when test="not(cudl:contains-text-or-displayable-elem(.))"><xsl:text>om. </xsl:text></xsl:when>
        <xsl:otherwise/>
      </xsl:choose>
    </xsl:variable>
    <xsl:text> </xsl:text>
    <em class="smaller smallcaps">
      <xsl:text>[</xsl:text>
      <xsl:value-of select="$action"/>
      <xsl:variable name="unique_wit_names" select="cudl:get_unique_witness_names(tokenize(@wit,'\s+'))"/>
      <xsl:value-of select="cudl:write_shelfmark_list($unique_wit_names)"/>
      <xsl:text>]</xsl:text>
    </em>
  </xsl:template>

  <xsl:template match="tei:lem|tei:rdg" mode="app-rdg-texty">
    <xsl:call-template name="apply-mode-to-templates">
      <xsl:with-param name="displayMode" select="$viewMode"/>
      <xsl:with-param name="node" select="*|text()"/>
    </xsl:call-template>
    <xsl:variable name="action">
      <xsl:choose>
        <xsl:when test="cudl:contains-text-or-displayable-elem(.)"></xsl:when>
        <xsl:otherwise><xsl:text>om. </xsl:text></xsl:otherwise>
      </xsl:choose>
    </xsl:variable>
    <xsl:text> </xsl:text>
    <em class="smaller smallcaps">
      <xsl:text>[</xsl:text>
      <xsl:value-of select="$action"/>
      <xsl:variable name="unique_wit_names" select="cudl:get_unique_witness_names(tokenize(@wit,'\s+'))"/>
      <xsl:value-of select="cudl:write_shelfmark_list($unique_wit_names)"/>
      <xsl:text>]</xsl:text>
    </em>
  </xsl:template>

  <xsl:template name="iterate_texty_rdg">
    <xsl:param name="elem"/>
    <xsl:param name="lem_empty" select="false()"/>
    <xsl:for-each select="$elem[@type=('substantive', 'hisubs')]">
      <xsl:sort select="min(for $x in tokenize(@wit,'\s+') return index-of($witnesses,$x))[1]"/>
      <xsl:if test="not(position()=1)">
        <span class="delim">|</span>
      </xsl:if>
      <xsl:choose>
        <xsl:when test="$lem_empty=false()">
          <xsl:apply-templates select="." mode="app-rdg-texty"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:apply-templates select="." mode="app-rdg-add"/>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:for-each>
  </xsl:template>
  
  <!-- Dipl/Normalised code below -->
    <xsl:template match="tei:abbr" mode="normalised"/>

    <xsl:template match="tei:abbr" mode="diplomatic">
        <xsl:apply-templates mode="#current"/>
    </xsl:template>


    <xsl:template match="tei:expan" mode="normalised">
        <xsl:apply-templates mode="#current"/>
    </xsl:template>
    
    <xsl:template match="tei:expan" mode="diplomatic"/>

    
  <xsl:template match="tei:orig[parent::tei:choice]" mode="normalised"/>
    
  <xsl:template match="tei:orig[parent::tei:choice]" mode="diplomatic">
        <xsl:variable name="gloss">
            <xsl:call-template name="gloss">
                <xsl:with-param name="current_node" select="."/>
            </xsl:call-template>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="not($gloss ='')">
                <span class="gloss" title="{$gloss}">
                    <xsl:apply-templates mode="#current"/>
                </span>
            </xsl:when>
            <xsl:otherwise>
                <xsl:apply-templates mode="#current"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    

  <xsl:template match="tei:reg[not(@type='gloss')][parent::tei:choice]" mode="normalised">
        <xsl:variable name="gloss">
            <xsl:call-template name="gloss">
                <xsl:with-param name="current_node" select="."/>
            </xsl:call-template>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="not($gloss ='')">
                <span class="gloss" title="{$gloss}">
                    <xsl:apply-templates mode="#current"/>
                </span>
            </xsl:when>
            <xsl:otherwise>
                <xsl:apply-templates mode="#current"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    
  <xsl:template match="tei:reg[@type='gloss'][parent::tei:choice][not(preceding-sibling::tei:reg)][not(following-sibling::tei:reg)]" mode="normalised">
        <xsl:apply-templates mode="#current"/>
    </xsl:template>
    
  <xsl:template match="tei:reg[@type='gloss'][parent::tei:choice][preceding-sibling::tei:reg or following-sibling::tei:reg]" mode="normalised"/>
  
  <xsl:template match="tei:subst" mode="#all">
    <span class="subst">
      <xsl:apply-templates mode="#current"/>
    </span>
  </xsl:template>
    
  <xsl:template match="tei:damage" mode="#all">
    <span class="delim">
      <xsl:text>[</xsl:text>
    </span>
    <span class="damage" title="This text damaged in source">
      <xsl:apply-templates mode="#current"/>
    </span>
    <span class="delim">
      <xsl:text>]</xsl:text>
    </span>
  </xsl:template>
  
  <xsl:template match="tei:reg[parent::tei:choice]" mode="diplomatic"/>

    <xsl:template match="tei:sic[parent::tei:choice]" mode="normalised"/>
    
    <xsl:template match="tei:sic[parent::tei:choice]" mode="diplomatic">
        <xsl:variable name="correction">
            <xsl:choose>
                <xsl:when test="parent::tei:choice[current()]/tei:corr/attribute::type">
                    <xsl:value-of select="parent::tei:choice[current()]/tei:corr/attribute::type"/>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:value-of select="parent::tei:choice[current()]/tei:corr/text()[normalize-space(.)]"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:variable>
        <xsl:choose>
            <xsl:when test="lower-case($correction) = 'notext'">
                <span title="Editorial Note: This text is redundant.">
                    <xsl:apply-templates mode="#current"/>
                    <xsl:text>&#160;</xsl:text>
                    <span class="delim">
                        <xsl:text>[sic]</xsl:text>
                    </span>
                </span>
            </xsl:when>
            <xsl:when test="lower-case($correction) = 'deltext'">
                <span title="Editorial Note: This text is redundant.">
                    <xsl:apply-templates mode="#current"/>
                    <xsl:text>&#160;</xsl:text>
                    <span class="delim">
                      <xsl:text>[sic]</xsl:text>
                    </span>
                </span>
            </xsl:when>
            <xsl:otherwise>
                <xsl:variable name="outputstring">
                    <xsl:apply-templates select="parent::tei:choice[current()]/tei:corr" mode="tooltip"/>
                </xsl:variable>
                <span>
                    <xsl:attribute name="title">
                        <xsl:variable name="title_text">
                            <xsl:text>A correction of </xsl:text>
                            <![CDATA["]]><xsl:value-of select="$outputstring"/><![CDATA["]]>
                            <xsl:text> has been supplied for this text.</xsl:text>
                        </xsl:variable>
                        <xsl:value-of select="normalize-space($title_text)"/>
                    </xsl:attribute>
                    <xsl:apply-templates mode="#current"/>
                    <xsl:text>&#160;</xsl:text>
                    <span class="delim">
                      <xsl:text>[sic]</xsl:text>
                    </span>
                </span>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
  
  <xsl:template match="tei:sic[not(parent::tei:choice)]" mode="#all">
    <span class="sic" title="This text is in error in source">
      <xsl:apply-templates mode="#current" />
    </span>
    <span class="delim">
      <xsl:text>(!)</xsl:text>
    </span>
  </xsl:template>

  <!-- These templates should only fire in non-casebooks materials -->
  <xsl:template match="tei:text//tei:corr[not(parent::tei:choice)]|
    tei:text//tei:orig[not(parent::tei:choice)]|
    tei:text//tei:reg[not(parent::tei:choice)]" mode="#all">
    <xsl:apply-templates mode="#current"/>
  </xsl:template>
  
  <xsl:template match="tei:corr[parent::tei:choice]" mode="tooltip">
        <xsl:choose>
            <xsl:when test="tei:choice">
                <xsl:call-template name="apply-mode-to-templates">
                    <xsl:with-param name="displayMode" select="'diplomatic'"/>
                    <xsl:with-param name="node" select="*|text()"/>
                </xsl:call-template>
            </xsl:when>
            <xsl:otherwise>
                <xsl:call-template name="apply-mode-to-templates">
                    <xsl:with-param name="displayMode" select="'normalised'"/>
                    <xsl:with-param name="node" select="."/>
                </xsl:call-template>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

  <xsl:template match="tei:corr[parent::tei:choice]" mode="normalised">
        <xsl:apply-templates mode="#current"/>
    </xsl:template>
    
  <xsl:template match="tei:corr[parent::tei:choice]" mode="diplomatic"/>

    <!-- Additions and deletions -->
    
    <xsl:template match="tei:add" mode="normalised">
      <!-- Display addition without any indication that it's normalised -->
        <xsl:apply-templates mode="#current"/>
    </xsl:template>
    
    <xsl:template match="tei:add" mode="diplomatic">
        <xsl:variable name="place_token" select="tokenize(@place,'\s+')[1]"/>
        <xsl:choose>
            <xsl:when test="$place_token = 'supralinear'">
                <span class="supra-n" title="This text added above the line">
                    <span class="delim">\</span>
                    <xsl:apply-templates mode="#current"/>
                    <span class="delim">/</span>
                </span>
            </xsl:when>
            <xsl:when test="$place_token = 'infralinear'">
                <span class="infra-n" title="This text added below the line">
                    <span class="delim">/</span>
                    <xsl:apply-templates mode="#current"/>
                    <span class="delim">\</span>
                </span>
            </xsl:when>
            <xsl:when test="$place_token = 'over'">
                <span class="over-n" title="This text is written over the foregoing">
                    <span class="delim">|</span>
                    <xsl:apply-templates mode="#current"/>
                    <span class="delim">|</span>
                </span>
            </xsl:when>
            <xsl:otherwise>
                <xsl:variable name="title_attr">
                    <xsl:choose>
                        <xsl:when test="$place_token='inline'">
                            <xsl:text>This text added inline</xsl:text>
                        </xsl:when>
                        <xsl:when test="$place_token='lineBeginning'">
                            <xsl:text>This text added at the beginning of the line</xsl:text>
                        </xsl:when>
                        <xsl:when test="$place_token='lineEnd'">
                            <xsl:text>This text added at the end of the line</xsl:text>
                        </xsl:when>
                        <xsl:when test="$place_token='marginLeft'">
                            <xsl:text>This text added in the left margin</xsl:text>
                        </xsl:when>
                        <xsl:when test="$place_token='marginRight'">
                            <xsl:text>This text added in the right margin</xsl:text>
                        </xsl:when>
                        <xsl:when test="$place_token='interlinear'">
                            <xsl:text>This text added between the lines</xsl:text>
                        </xsl:when>
                        <xsl:when test="$place_token='pageBottom'">
                            <xsl:text>This text added at the bottom of the page</xsl:text>
                        </xsl:when>
                        <xsl:when test="$place_token='pageTop'">
                            <xsl:text>This text added at the top of the page</xsl:text>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:value-of select="concat('This text added from ', @place)"/>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:variable>
                <span class="inline-n" title="{$title_attr}">
                    <span class="delim">|</span>
                    <xsl:apply-templates mode="#current"/>
                    <span class="delim">|</span>
                </span>
            </xsl:otherwise>
        </xsl:choose>
</xsl:template>

    <xsl:template match="tei:del[not(@type=('redactedBlockStrikethrough','redactedCancelled'))]" mode="normalised"/>
    
    <xsl:template match="tei:del[not(@type=('redactedBlockStrikethrough', 'redactedCancelled'))]" mode="diplomatic">
        <xsl:choose>
            <xsl:when test="@type = 'cancelled'">
                <span class="cancel-n" title="Cancelled">
                    <xsl:apply-templates mode="#current"/>
                </span>
            </xsl:when>
            <xsl:when test="@type = 'erased'">
                <span class="erased-n" title="This text has been erased">
                    <xsl:apply-templates mode="#current"/>
                </span>
            </xsl:when>
            <xsl:when test="@type = ('wordStrikethrough', 'strikethrough')">
                <span class="wordstrike-n" title="Deleted">
                    <span class="color_fix">
                        <xsl:apply-templates mode="#current"/>
                    </span>
                </span>
            </xsl:when>
            <xsl:when test="@type = 'over'">
                <span class="delover-n" title="This text has been overwritten">
                    <span class="color_fix">
                        <xsl:apply-templates mode="#current"/>
                    </span>
                </span>
            </xsl:when>
            <xsl:when test="@type = 'blockStrikethrough'">
                <span class="blockstrike-n" title="This block of text has been deleted">
                    <span class="color_fix">
                        <xsl:apply-templates mode="#current"/>
                    </span>
                </span>
            </xsl:when>
            <xsl:when test="@type = 'redactedBlockStrikethrough'">
                <span class="blockstrike-n" title="This block of text appears to have been censored by the author">
                    <span class="color_fix">
                        <xsl:apply-templates mode="#current"/>
                    </span>
                </span>
            </xsl:when>
            <xsl:when test="@type = 'redactedCancelled'">
                <span class="cancel-n" title="This text appears to have been censored by the author">
                    <span class="color_fix">
                        <xsl:apply-templates mode="#current"/>
                    </span>
                </span>
            </xsl:when>
          <!-- illegible is only supported because it was in the original CDL file
               Delete?
          -->
          <xsl:when test="@type = 'illegible'">
            <span class="cancel-n" title="This text deleted and illegible">
              <span class="color_fix">
                <xsl:apply-templates mode="#current"/>
              </span>
            </span>
          </xsl:when>
            <xsl:otherwise>
                <span class="flag-n" title="Deleted Text">
                    <xsl:apply-templates mode="#current"/>
                </span>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>  
    
    <xsl:template match="tei:gap[@reason = ('blotDel', 'del', 'over')][not(ancestor::tei:del[contains(@type,'redacted')])]" mode="normalised"/>

    <xsl:template match="tei:gap[@reason = ('blotDel', 'del', 'over')][not(ancestor::tei:del[contains(@type, 'redacted')])]" mode="diplomatic">
        <xsl:variable name="parsedUnit" select="cudl:parseUnit(@unit,@extent)" />
        
        <span class="gap">
            <xsl:choose>
                <xsl:when test="@reason = 'blotDel'">
                    <xsl:attribute name="title" select="concat('Blot or deletion: ', @extent, ' ', $parsedUnit)"/>
                </xsl:when>
                <xsl:when test="@reason = 'del'">
                    <xsl:attribute name="title" select="'Text is illegible because it is deleted'"/>
                </xsl:when>
                <xsl:when test="@reason = 'over'">
                    <xsl:attribute name="title" select="'Text is illegible or unclear because it is overwritten'"/>
                </xsl:when>
            </xsl:choose>
          <span class="gap">[illeg]</span>
        </span>
    </xsl:template>

    <!-- Footnotes and endnotes -->
    <xsl:template match="tei:text//tei:note[not(@target)]" mode="footer">
        <xsl:variable name="noteNumber">
            <xsl:choose>
                <xsl:when test="@type='editorial'">
                    <xsl:number format="1" count="tei:text//tei:note[@type='editorial']" level="any" />
                </xsl:when>
                <xsl:otherwise>
                    <xsl:number format="1" count="tei:text//tei:note[not(@target) and not(@type)]" level="any"/>
                </xsl:otherwise>
            </xsl:choose>
        </xsl:variable>
        <xsl:variable name="noteId">
            <xsl:choose>
                <xsl:when test="@type = 'editorial'">
                    <xsl:text>ed</xsl:text>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:text>n</xsl:text>
                </xsl:otherwise>
            </xsl:choose>
            <xsl:value-of select="$noteNumber"/>
        </xsl:variable>
        <xsl:variable name="noteIndicator">
            <xsl:if test="@type = 'editorial'">
                <xsl:text>Editorial&#160;Note&#160;</xsl:text>
            </xsl:if>
            <xsl:value-of select="$noteNumber"/>
        </xsl:variable>
        <div id="{$noteId}" class="endnote">
            <xsl:choose>
                <xsl:when test="normalize-space(.) or *">
                    <xsl:choose>
                        <xsl:when test="$viewMode = 'normalised' and . = .//tei:del">
                            <p>
                                <sup class="notenumber">
                                    <xsl:value-of select="$noteIndicator"/>
                                </sup>
                                <xsl:text> </xsl:text>
                                <strong>Note:</strong>
                                <xsl:text> </xsl:text>
                                <em>
                                    <xsl:text>The contents of this note are only visible in the diplomatic transcript because they were deleted on the original manuscript</xsl:text>
                                </em>
                            </p>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:choose>
                                <xsl:when test="(descendant::tei:p | descendant::tei:head)">
                                    <p>
                                        <sup class="notenumber">
                                            <xsl:value-of select="$noteIndicator"/>
                                        </sup>
                                    </p>
                                        <xsl:choose>
                                            <xsl:when test="$viewMode='diplomatic'">
                                                <xsl:apply-templates select="." mode="remode-contents-diplomatic"/>
                                            </xsl:when>
                                            <xsl:otherwise>
                                                <xsl:apply-templates select="." mode="remode-contents-normalised"/>
                                            </xsl:otherwise>
                                        </xsl:choose>
                                </xsl:when>
                                <xsl:otherwise>
                                    <p>
                                        <sup class="notenumber">
                                            <xsl:value-of select="$noteIndicator"/>
                                        </sup>
                                        <xsl:text> </xsl:text>
                                        <xsl:choose>
                                            <xsl:when test="$viewMode='diplomatic'">
                                                <xsl:apply-templates select="." mode="remode-contents-diplomatic"/>
                                            </xsl:when>
                                            <xsl:otherwise>
                                                <xsl:apply-templates select="." mode="remode-contents-normalised"/>
                                            </xsl:otherwise>
                                        </xsl:choose>
                                    </p>
                                </xsl:otherwise>
                            </xsl:choose>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:when>
                <xsl:otherwise>
                    <p>
                        <sup class="notenumber">
                            <xsl:value-of select="$noteIndicator"/>
                        </sup>
                        <xsl:text> </xsl:text>
                        <strong>Editorial Note:</strong>
                        <xsl:text> This Note Empty</xsl:text>
                    </p>
                </xsl:otherwise>
            </xsl:choose>
        </div>
    </xsl:template>
    
    <xsl:template match="tei:text//tei:note" mode="remode-contents-diplomatic">
        <xsl:apply-templates mode="diplomatic"/>
    </xsl:template>
    
    <xsl:template match="tei:text//tei:note" mode="remode-contents-normalised">
        <xsl:apply-templates mode="normalised"/>
    </xsl:template>

    <!-- do texty app -->
    <xsl:template match="tei:app[tei:rdg[@type=('substantive', 'hisubs')]][(tei:lem|tei:rdg[@type=('substantive', 'hisubs')])[cudl:contains-text-or-displayable-elem(.)]]" mode="diplomatic" priority="1">
        <!-- if it's texty or contains an elemen apart from the special suspects ... ouput it -->
        <xsl:variable name="huh" select="generate-id(current())"/>
        <span class="lemapp-n" title="{$app_mouseover}">
            <xsl:choose>
                <xsl:when test="tei:lem[normalize-space() or child::*]">
                    <span class="delim">|</span>
                    <xsl:apply-templates select="tei:lem" mode="app-rdg-texty"/>
                    <span class="delim">|</span>
                    <xsl:call-template name="iterate_texty_rdg">
                        <xsl:with-param name="elem" select="tei:rdg[@type=('substantive', 'hisubs')]"/>
                        <xsl:with-param name="lem_empty" select="false()"/>
                    </xsl:call-template>
                    <span class="delim">|</span>
                </xsl:when>
                <xsl:when test="tei:lem[not(cudl:contains-text-or-displayable-elem(.))] and tei:rdg[@type=('substantive', 'hisubs')]">
                    <span class="delim">|</span>
                    <xsl:call-template name="iterate_texty_rdg">
                        <xsl:with-param name="elem" select="tei:rdg[@type=('substantive', 'hisubs')]"/>
                        <xsl:with-param name="lem_empty" select="true()"/>
                    </xsl:call-template>
                    <span class="delim">|</span>
                </xsl:when>
            </xsl:choose>
        </span>
    </xsl:template>
    
    <!-- app not contain relevant rdg but has texty lem -->
    <xsl:template match="tei:app[not(tei:rdg[@type=('substantive', 'hisubs')])][tei:lem[cudl:contains-text-or-displayable-elem(.)]]" mode="diplomatic" priority="1">
        <xsl:variable name="huh" select="generate-id(current())"/>
        <xsl:variable name="base" select="tokenize(@n,'\s+')"/>
        <xsl:choose>
            <xsl:when test="not(tei:lem/tokenize(@wit,'\s+')=$base)">
                <span class="lemapp-n"  title="{$app_mouseover}">
                    <span class="delim">|</span>
                    <xsl:apply-templates select="tei:lem" mode="app-rdg-texty"/>
                    <span class="delim">|</span>
                </span></xsl:when>
            <xsl:otherwise>
                <xsl:apply-templates select="tei:lem" mode="#current"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    
    
    <xsl:template match="tei:app[tei:lem[cudl:contains-text-or-displayable-elem(.)]]" mode="normalised" priority="1">
        <xsl:variable name="huh" select="generate-id(current())"/>
        <xsl:variable name="base" select="tokenize(@n,'\s+')"/>
        
        <xsl:choose>
            <xsl:when test="not(tei:lem/tokenize(@wit,'\s+')=$base)">
                <span class="lemapp-n"  title="{$app_mouseover}">
                    <span class="delim">|</span>
                    <xsl:apply-templates select="tei:lem" mode="app-rdg-texty"/>
                    <span class="delim">|</span>
                </span></xsl:when>
            <xsl:otherwise>
                <xsl:apply-templates select="tei:lem" mode="#current"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    
    <xsl:template match="tei:app[tei:rdg[@type=('substantive', 'hisubs')]][tei:lem[not(cudl:contains-text-or-displayable-elem(.))] and tei:rdg[@type=('substantive', 'hisubs')][cudl:contains-text-or-displayable-elem(.)]]" mode="normalised" priority="1">
        <!-- if it's a substantial change AND lem is not text, iterate over the substantial rdg -->
        <span class="lemapp-n" title="{$app_mouseover}">
            <span class="delim">|</span>
            <xsl:call-template name="iterate_texty_rdg">
                <xsl:with-param name="elem" select="tei:rdg[@type=('substantive', 'hisubs')]"/>
                <xsl:with-param name="lem_empty" select="true()"/>
            </xsl:call-template>
            <span class="delim">|</span>
        </span>
    </xsl:template>
  
</xsl:stylesheet>